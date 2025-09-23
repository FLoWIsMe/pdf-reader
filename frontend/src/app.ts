import axios from "axios";

interface WordData {
  word: string;
  start_pos: number;
  end_pos: number;
}

interface PageData {
  page_number: number;
  original_text: string;
  processed_text: string;
  words: WordData[];
  image: string | null;
  has_header_footer_removal: boolean;
}

interface PDFData {
  success: boolean;
  total_pages: number;
  pages: PageData[];
  header_patterns: string[];
  footer_patterns: string[];
}

class PDFReaderApp {
  private apiBaseUrl = "http://localhost:8000";
  private currentPDF: PDFData | null = null;
  private speechSynthesis: SpeechSynthesis;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private isPlaying = false;
  private isPaused = false;
  private currentPageIndex = 0;
  private currentWordIndex = 0;
  private speechRate = 1.0;
  private wordElements: Map<string, HTMLElement> = new Map();
  private keyboardListenerActive = false;
  private isImageView = true;
  private skipHeaderFooter = true;
  private currentWordsData: WordData[][] = [];

  constructor() {
    this.speechSynthesis = window.speechSynthesis;
    this.initializeEventListeners();
    this.initializeKeyboardShortcuts();
    console.log("PDFReaderApp initialized");
  }

  private initializeEventListeners(): void {
    console.log("Initializing event listeners");
    const uploadBtn = document.getElementById("uploadBtn") as HTMLButtonElement;
    const playBtn = document.getElementById("playBtn") as HTMLButtonElement;
    const pauseBtn = document.getElementById("pauseBtn") as HTMLButtonElement;
    const stopBtn = document.getElementById("stopBtn") as HTMLButtonElement;
    const speedRange = document.getElementById(
      "speedRange"
    ) as HTMLInputElement;
    const toggleViewBtn = document.getElementById(
      "toggleViewBtn"
    ) as HTMLButtonElement;
    const skipHeaderFooter = document.getElementById(
      "skipHeaderFooter"
    ) as HTMLInputElement;

    uploadBtn.addEventListener("click", () => this.handleUpload());
    playBtn.addEventListener("click", () => this.handlePlay());
    pauseBtn.addEventListener("click", () => this.handlePause());
    stopBtn.addEventListener("click", () => this.handleStop());
    speedRange.addEventListener("input", (e) => this.handleSpeedChange(e));
    toggleViewBtn.addEventListener("click", () => this.toggleView());
    skipHeaderFooter.addEventListener("change", (e) =>
      this.handleSkipHeaderFooterChange(e)
    );
  }

  private initializeKeyboardShortcuts(): void {
    document.addEventListener("keydown", (event) => {
      if (
        event.target instanceof HTMLElement &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)
      ) {
        if (event.code === "Space") {
          event.preventDefault();
          this.togglePlayPause();
        } else if (event.code === "KeyV") {
          event.preventDefault();
          this.toggleView();
        }
      }
    });

    this.keyboardListenerActive = true;
  }

  private toggleView(): void {
    if (!this.currentPDF) return;

    console.log(
      `Toggling view from ${this.isImageView ? "image" : "text"} to ${
        this.isImageView ? "text" : "image"
      }`
    );

    this.isImageView = !this.isImageView;
    const toggleViewBtn = document.getElementById(
      "toggleViewBtn"
    ) as HTMLButtonElement;

    if (this.isImageView) {
      toggleViewBtn.textContent = "Switch to Text View";
    } else {
      toggleViewBtn.textContent = "Switch to Image View";
    }

    this.renderPDF();
  }

  private handleSkipHeaderFooterChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    console.log(`Skip header/footer changed to: ${target.checked}`);
    this.skipHeaderFooter = target.checked;

    if (this.currentPDF) {
      this.updateCurrentWordsData();
      this.renderPDF();
    }
  }

  private updateCurrentWordsData(): void {
    if (!this.currentPDF) return;

    console.log(
      "Updating current words data, skipHeaderFooter:",
      this.skipHeaderFooter
    );

    this.currentWordsData = this.currentPDF.pages.map((page, pageIndex) => {
      const words = this.skipHeaderFooter
        ? page.words
        : this.extractWordsFromText(page.original_text);
      console.log(`Page ${pageIndex}: ${words.length} words`);
      return words;
    });

    console.log(
      "Current words data updated:",
      this.currentWordsData.length,
      "pages"
    );
  }

  private togglePlayPause(): void {
    if (!this.currentPDF || !this.keyboardListenerActive) return;

    console.log("Toggle play/pause called");
    const playBtn = document.getElementById("playBtn") as HTMLButtonElement;
    const pauseBtn = document.getElementById("pauseBtn") as HTMLButtonElement;

    if (!this.isPlaying) {
      if (!playBtn.disabled) {
        this.handlePlay();
      }
    } else if (!this.isPaused) {
      if (!pauseBtn.disabled) {
        this.handlePause();
      }
    } else {
      if (!playBtn.disabled) {
        this.handlePlay();
      }
    }
  }

  private async handleUpload(): Promise<void> {
    const pdfInput = document.getElementById("pdfInput") as HTMLInputElement;
    const file = pdfInput.files?.[0];

    if (!file) {
      this.updateStatus("Please select a PDF file");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      console.log("Starting PDF upload");
      this.updateStatus("Uploading and processing PDF...");

      const response = await axios.post(
        `${this.apiBaseUrl}/upload-pdf/`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      console.log("PDF upload successful, response:", response.data);
      this.currentPDF = response.data.data;
      this.updateCurrentWordsData();
      this.renderPDF();
      this.enableControls();
      this.keyboardListenerActive = true;

      const headerFooterInfo = this.getHeaderFooterInfo();
      this.updateStatus(
        `PDF loaded successfully. ${headerFooterInfo} Click Play or press Spacebar to start reading.`
      );
    } catch (error) {
      console.error("Upload error:", error);
      this.updateStatus("Error uploading PDF. Please try again.");
    }
  }

  private getHeaderFooterInfo(): string {
    if (!this.currentPDF) return "";

    const { header_patterns, footer_patterns } = this.currentPDF;
    const totalPatterns = header_patterns.length + footer_patterns.length;

    if (totalPatterns > 0) {
      return `Detected ${header_patterns.length} header(s) and ${footer_patterns.length} footer(s).`;
    }

    return "No repeating headers/footers detected.";
  }

  private renderPDF(): void {
    if (!this.currentPDF) return;

    console.log(`Rendering PDF in ${this.isImageView ? "image" : "text"} view`);

    const pdfPagesContainer = document.getElementById("pdfPages");
    if (!pdfPagesContainer) return;

    pdfPagesContainer.innerHTML = "";
    this.wordElements.clear();

    console.log("Cleared word elements, count:", this.wordElements.size);

    // Show header/footer info if patterns were detected
    if (
      this.currentPDF.header_patterns.length > 0 ||
      this.currentPDF.footer_patterns.length > 0
    ) {
      const infoDiv = document.createElement("div");
      infoDiv.className = "header-footer-info";
      infoDiv.innerHTML = `
        <strong>Header/Footer Detection:</strong> 
        Found ${this.currentPDF.header_patterns.length} header pattern(s) and 
        ${this.currentPDF.footer_patterns.length} footer pattern(s). 
        ${
          this.skipHeaderFooter
            ? "Currently skipping them during reading."
            : "Currently including them during reading."
        }
      `;
      pdfPagesContainer.appendChild(infoDiv);
    }

    this.currentPDF.pages.forEach((page, pageIndex) => {
      console.log(
        `Rendering page ${pageIndex}, image available: ${!!page.image}`
      );

      const pageDiv = document.createElement("div");
      pageDiv.className = `page ${
        this.isImageView ? "image-view" : "text-view"
      }`;
      pageDiv.dataset.pageIndex = pageIndex.toString();

      const pageHeader = document.createElement("h3");
      pageHeader.textContent = `Page ${page.page_number}`;
      pageDiv.appendChild(pageHeader);

      if (this.isImageView && page.image) {
        console.log(`Creating image view for page ${pageIndex}`);
        // Render PDF page as image
        const img = document.createElement("img");
        img.src = `data:image/png;base64,${page.image}`;
        img.alt = `Page ${page.page_number}`;
        img.style.maxWidth = "100%";
        img.style.height = "auto";
        pageDiv.appendChild(img);

        // Add click handler for image view - but NOT as an overlay that interferes
        this.addImageClickHandler(pageDiv, pageIndex);
      } else if (this.isImageView && !page.image) {
        console.log(`No image available for page ${pageIndex}`);
        // Show message that image view is not available
        const messageDiv = document.createElement("div");
        messageDiv.style.textAlign = "center";
        messageDiv.style.padding = "2rem";
        messageDiv.style.color = "#7f8c8d";
        messageDiv.innerHTML =
          "<p>Image view not available. Switch to text view to see content.</p>";
        pageDiv.appendChild(messageDiv);
      } else {
        console.log(`Creating text view for page ${pageIndex}`);
        // Render as interactive text
        const pageTextDiv = document.createElement("div");
        pageTextDiv.className = "page-text";
        pageTextDiv.id = `page-${page.page_number}`;

        const textToUse = this.skipHeaderFooter
          ? page.processed_text
          : page.original_text;
        const wordsToUse = this.currentWordsData[pageIndex] || [];

        console.log(
          `Text view - words to use: ${wordsToUse.length}, text length: ${textToUse.length}`
        );

        this.createWordElements(pageIndex, textToUse, wordsToUse, pageTextDiv);
        pageDiv.appendChild(pageTextDiv);
      }

      pdfPagesContainer.appendChild(pageDiv);
    });

    console.log(
      `Finished rendering PDF. Total word elements: ${this.wordElements.size}`
    );
  }

  private addImageClickHandler(pageDiv: HTMLElement, pageIndex: number): void {
    console.log(`Adding image click handler for page ${pageIndex}`);

    // Create a button instead of an overlay to avoid conflicts
    const switchButton = document.createElement("button");
    switchButton.className = "btn btn-secondary switch-to-text-btn";
    switchButton.textContent = "Click words to start reading";
    switchButton.style.position = "absolute";
    switchButton.style.top = "10px";
    switchButton.style.right = "10px";
    switchButton.style.zIndex = "100";

    switchButton.addEventListener("click", (e) => {
      console.log(`Switch to text button clicked for page ${pageIndex}`);
      e.preventDefault();
      e.stopPropagation();

      // Temporarily switch to text view for word selection
      const originalView = this.isImageView;
      this.isImageView = false;
      this.renderPDF();

      // Add a notice about the temporary switch
      const notice = document.createElement("div");
      notice.className = "temporary-notice";
      notice.innerHTML =
        "Click on any word below to start reading from that position, then switch back to image view if desired.";

      const pagesContainer = document.getElementById("pdfPages");
      if (pagesContainer && pagesContainer.firstChild) {
        pagesContainer.insertBefore(notice, pagesContainer.firstChild);
      }
    });

    pageDiv.style.position = "relative";
    pageDiv.appendChild(switchButton);
  }

  private extractWordsFromText(text: string): WordData[] {
    const words: WordData[] = [];
    const wordPattern = /\b\w+\b/g;
    let match;

    while ((match = wordPattern.exec(text)) !== null) {
      words.push({
        word: match[0],
        start_pos: match.index,
        end_pos: match.index + match[0].length,
      });
    }

    console.log(
      `Extracted ${words.length} words from text of length ${text.length}`
    );
    return words;
  }

  private createWordElements(
    pageIndex: number,
    text: string,
    words: WordData[],
    container: HTMLElement
  ): void {
    console.log(
      `Creating word elements for page ${pageIndex}, ${words.length} words`
    );

    let lastIndex = 0;
    let createdElements = 0;

    words.forEach((wordData, wordIndex) => {
      // Add any text before this word (spaces, punctuation, etc.)
      if (wordData.start_pos > lastIndex) {
        const beforeText = text.slice(lastIndex, wordData.start_pos);
        container.appendChild(document.createTextNode(beforeText));
      }

      // Create word element
      const wordElement = document.createElement("span");
      wordElement.className = "word";
      wordElement.textContent = wordData.word;

      // Create unique key for tracking
      const wordKey = `${pageIndex}-${wordIndex}`;
      wordElement.dataset.pageIndex = pageIndex.toString();
      wordElement.dataset.wordIndex = wordIndex.toString();
      wordElement.dataset.wordKey = wordKey;
      wordElement.tabIndex = 0;

      console.log(
        `Creating word element: "${wordData.word}" with key: ${wordKey}`
      );

      // Add click listener for jumping to word and auto-start
      const clickHandler = (e: Event) => {
        console.log(
          `Word clicked: "${wordData.word}" (page: ${pageIndex}, word: ${wordIndex})`
        );
        e.preventDefault();
        e.stopPropagation();
        this.jumpToWordAndPlay(pageIndex, wordIndex);
      };

      wordElement.addEventListener("click", clickHandler);
      console.log(`Added click listener to word: "${wordData.word}"`);

      // Add keyboard support for word elements
      wordElement.addEventListener("keydown", (event) => {
        if (event.code === "Enter" || event.code === "Space") {
          console.log(`Keyboard activation on word: "${wordData.word}"`);
          event.preventDefault();
          event.stopPropagation();
          this.jumpToWordAndPlay(pageIndex, wordIndex);
        }
      });

      container.appendChild(wordElement);
      this.wordElements.set(wordKey, wordElement);
      createdElements++;

      lastIndex = wordData.end_pos;
    });

    // Add any remaining text after the last word
    if (lastIndex < text.length) {
      const remainingText = text.slice(lastIndex);
      container.appendChild(document.createTextNode(remainingText));
    }

    console.log(
      `Created ${createdElements} word elements for page ${pageIndex}. Total in map: ${this.wordElements.size}`
    );
  }

  private jumpToWordAndPlay(pageIndex: number, wordIndex: number): void {
    console.log(
      `jumpToWordAndPlay called: page ${pageIndex}, word ${wordIndex}`
    );

    if (!this.currentPDF) {
      console.log("No PDF loaded, cannot jump to word");
      return;
    }

    // Stop current playback
    if (this.isPlaying) {
      console.log("Stopping current playback");
      this.handleStop();
    }

    // Set new position
    this.currentPageIndex = pageIndex;
    this.currentWordIndex = wordIndex;

    console.log(
      `Set new position: page ${this.currentPageIndex}, word ${this.currentWordIndex}`
    );

    // Clear previous highlighting and show clicked start position
    this.clearHighlighting();
    const clickedWordElement = this.findWordElement(pageIndex, wordIndex);

    if (clickedWordElement) {
      console.log(`Found clicked word element, adding clicked-start class`);
      clickedWordElement.classList.add("clicked-start");

      // Scroll to clicked word only in text view
      if (!this.isImageView) {
        clickedWordElement.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    } else {
      console.log(
        `Could not find word element for page ${pageIndex}, word ${wordIndex}`
      );
    }

    // Auto-start reading from this position
    this.isPlaying = true;
    this.isPaused = false;
    this.startReading();
    this.updateControlsState();

    const wordsToUse = this.currentWordsData[pageIndex] || [];
    const targetWord = wordsToUse[wordIndex];

    if (targetWord) {
      console.log(`Starting to read from word: "${targetWord.word}"`);
      this.updateStatus(
        `Started reading from page ${pageIndex + 1}, word: "${targetWord.word}"`
      );
    } else {
      console.log(
        `Could not find target word at page ${pageIndex}, word ${wordIndex}`
      );
    }
  }

  private handlePlay(): void {
    console.log("Handle play called");

    if (!this.currentPDF) {
      console.log("No PDF loaded");
      return;
    }

    if (this.isPaused) {
      console.log("Resuming from pause");
      this.speechSynthesis.resume();
      this.isPaused = false;
      this.updateControlsState();
      return;
    }

    console.log("Starting fresh playback");
    this.isPlaying = true;
    this.startReading();
    this.updateControlsState();
  }

  private startReading(): void {
    console.log(
      `Starting reading at page ${this.currentPageIndex}, word ${this.currentWordIndex}`
    );

    if (
      !this.currentPDF ||
      this.currentPageIndex >= this.currentPDF.pages.length
    ) {
      console.log("Reached end of document or no PDF");
      this.handleStop();
      this.updateStatus("Finished reading the document.");
      return;
    }

    const wordsToUse = this.currentWordsData[this.currentPageIndex] || [];
    console.log(
      `Words available for page ${this.currentPageIndex}: ${wordsToUse.length}`
    );

    if (this.currentWordIndex >= wordsToUse.length) {
      console.log(
        `Reached end of page ${this.currentPageIndex}, moving to next page`
      );
      this.currentPageIndex++;
      this.currentWordIndex = 0;
      this.startReading();
      return;
    }

    const currentWord = wordsToUse[this.currentWordIndex];
    if (!currentWord) {
      console.log(`No word found at index ${this.currentWordIndex}, skipping`);
      this.currentWordIndex++;
      this.startReading();
      return;
    }

    console.log(`Speaking word: "${currentWord.word}"`);

    // Highlight current word
    this.highlightCurrentWord();

    this.currentUtterance = new SpeechSynthesisUtterance(currentWord.word);

    // Apply current speech rate
    this.currentUtterance.rate = Math.min(this.speechRate, 10);
    this.currentUtterance.pitch = 1.0;
    this.currentUtterance.volume = 1.0;

    this.currentUtterance.onstart = () => {
      const skipInfo = this.skipHeaderFooter
        ? " (skipping headers/footers)"
        : "";
      this.updateStatus(
        `Reading page ${this.currentPageIndex + 1}: "${currentWord.word}" (${
          this.speechRate
        }x speed)${skipInfo}`
      );
    };

    this.currentUtterance.onend = () => {
      console.log(`Finished speaking word: "${currentWord.word}"`);
      if (this.isPlaying && !this.isPaused) {
        // Mark word as spoken
        this.markWordAsSpoken();
        this.currentWordIndex++;

        // Shorter delay calculation
        const delay = Math.max(2, Math.round(20 / this.speechRate));

        setTimeout(() => {
          this.startReading();
        }, delay);
      }
    };

    this.currentUtterance.onerror = (error) => {
      console.error("Speech synthesis error:", error);
      this.updateStatus("Error during speech synthesis");
    };

    this.speechSynthesis.speak(this.currentUtterance);
  }

  private highlightCurrentWord(): void {
    console.log(
      `Highlighting word at page ${this.currentPageIndex}, index ${this.currentWordIndex}`
    );

    // Clear previous current word highlighting but keep spoken words
    this.wordElements.forEach((element) => {
      element.classList.remove("current-word", "clicked-start");
    });

    // Find and highlight current word
    const wordElement = this.findWordElement(
      this.currentPageIndex,
      this.currentWordIndex
    );
    if (wordElement) {
      console.log(`Found word element, adding current-word class`);
      wordElement.classList.add("current-word");

      // Scroll to current word smoothly only in text view
      if (!this.isImageView) {
        wordElement.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    } else {
      console.log(
        `Could not find word element for highlighting at page ${this.currentPageIndex}, word ${this.currentWordIndex}`
      );
    }
  }

  private markWordAsSpoken(): void {
    const wordElement = this.findWordElement(
      this.currentPageIndex,
      this.currentWordIndex
    );
    if (wordElement) {
      console.log(`Marking word as spoken`);
      wordElement.classList.remove("current-word");
      wordElement.classList.add("spoken-word");
    }
  }

  private findWordElement(
    pageIndex: number,
    wordIndex: number
  ): HTMLElement | null {
    const wordKey = `${pageIndex}-${wordIndex}`;
    const element = this.wordElements.get(wordKey);
    console.log(
      `Looking for word element with key: ${wordKey}, found: ${!!element}`
    );
    return element || null;
  }

  private clearHighlighting(): void {
    console.log(`Clearing highlighting for ${this.wordElements.size} elements`);
    this.wordElements.forEach((element) => {
      element.classList.remove("current-word", "spoken-word", "clicked-start");
    });
  }

  private handlePause(): void {
    console.log("Handle pause called");
    if (this.speechSynthesis.speaking && !this.speechSynthesis.paused) {
      this.speechSynthesis.pause();
      this.isPaused = true;
      this.updateControlsState();
      this.updateStatus(
        "Reading paused - Press Spacebar or click Resume to continue"
      );
    }
  }

  private handleStop(): void {
    console.log("Handle stop called");
    this.speechSynthesis.cancel();
    this.isPlaying = false;
    this.isPaused = false;
    this.clearHighlighting();
    this.updateControlsState();
    this.updateStatus("Reading stopped");
  }

  private handleSpeedChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.speechRate = parseFloat(target.value);

    console.log(`Speed changed to: ${this.speechRate}`);

    const speedValue = document.getElementById("speedValue");
    if (speedValue) {
      speedValue.textContent = `${this.speechRate.toFixed(2)}x`;
    }

    // If currently speaking, cancel and restart with new speed immediately
    if (this.isPlaying && !this.isPaused) {
      this.speechSynthesis.cancel();
      setTimeout(() => {
        this.startReading();
      }, 10);
    }
  }

  private enableControls(): void {
    console.log("Enabling controls");
    const playBtn = document.getElementById("playBtn") as HTMLButtonElement;
    const pauseBtn = document.getElementById("pauseBtn") as HTMLButtonElement;
    const stopBtn = document.getElementById("stopBtn") as HTMLButtonElement;
    const speedRange = document.getElementById(
      "speedRange"
    ) as HTMLInputElement;
    const toggleViewBtn = document.getElementById(
      "toggleViewBtn"
    ) as HTMLButtonElement;
    const skipHeaderFooter = document.getElementById(
      "skipHeaderFooter"
    ) as HTMLInputElement;

    playBtn.disabled = false;
    pauseBtn.disabled = false;
    stopBtn.disabled = false;
    speedRange.disabled = false;
    toggleViewBtn.disabled = false;
    skipHeaderFooter.disabled = false;
  }

  private updateControlsState(): void {
    const playBtn = document.getElementById("playBtn") as HTMLButtonElement;
    const pauseBtn = document.getElementById("pauseBtn") as HTMLButtonElement;

    if (this.isPlaying && !this.isPaused) {
      playBtn.textContent = "Playing...";
      playBtn.disabled = true;
      pauseBtn.disabled = false;
    } else if (this.isPaused) {
      playBtn.textContent = "Resume";
      playBtn.disabled = false;
      pauseBtn.disabled = true;
    } else {
      playBtn.textContent = "Play";
      playBtn.disabled = false;
      pauseBtn.disabled = true;
    }
  }

  private updateStatus(message: string): void {
    const statusText = document.getElementById("statusText");
    if (statusText) {
      statusText.textContent = message;
    }
    console.log("Status update:", message);
  }
}

export default PDFReaderApp;
