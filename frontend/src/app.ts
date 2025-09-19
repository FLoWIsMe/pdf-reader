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
  private wordElements: HTMLElement[] = [];
  private keyboardListenerActive = false;
  private isImageView = true;
  private skipHeaderFooter = true;

  constructor() {
    this.speechSynthesis = window.speechSynthesis;
    this.initializeEventListeners();
    this.initializeKeyboardShortcuts();
  }

  private initializeEventListeners(): void {
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
    this.skipHeaderFooter = target.checked;

    if (this.currentPDF) {
      this.renderPDF();
    }
  }

  private togglePlayPause(): void {
    if (!this.currentPDF || !this.keyboardListenerActive) return;

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

      this.currentPDF = response.data.data;
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

    const pdfPagesContainer = document.getElementById("pdfPages");
    if (!pdfPagesContainer) return;

    pdfPagesContainer.innerHTML = "";
    this.wordElements = [];

    // Show header/footer info if patterns were detected
    if (
      this.currentPDF.header_patterns.length > 0 ||
      this.currentPDF.footer_patterns.length > 0
    ) {
      const infoDiv = document.createElement("div");
      infoDiv.className = "header-footer-info";
      infoDiv.innerHTML = `
                <strong>Header/Footer Detection:</strong> 
                Found ${
                  this.currentPDF.header_patterns.length
                } header pattern(s) and 
                ${this.currentPDF.footer_patterns.length} footer pattern(s). 
                ${
                  this.skipHeaderFooter
                    ? "Currently skipping them during reading."
                    : "Currently including them during reading."
                }
            `;
      pdfPagesContainer.appendChild(infoDiv);
    }

    this.currentPDF.pages.forEach((page) => {
      const pageDiv = document.createElement("div");
      pageDiv.className = `page ${
        this.isImageView ? "image-view" : "text-view"
      }`;

      const pageHeader = document.createElement("h3");
      pageHeader.textContent = `Page ${page.page_number}`;
      pageDiv.appendChild(pageHeader);

      if (this.isImageView && page.image) {
        // Render PDF page as image
        const img = document.createElement("img");
        img.src = `data:image/png;base64,${page.image}`;
        img.alt = `Page ${page.page_number}`;
        img.style.maxWidth = "100%";
        img.style.height = "auto";
        pageDiv.appendChild(img);
      } else if (this.isImageView && !page.image) {
        // Show message that image view is not available
        const messageDiv = document.createElement("div");
        messageDiv.style.textAlign = "center";
        messageDiv.style.padding = "2rem";
        messageDiv.style.color = "#7f8c8d";
        messageDiv.innerHTML =
          "<p>Image view not available. Switch to text view to see content.</p>";
        pageDiv.appendChild(messageDiv);
      } else {
        // Render as interactive text
        const pageTextDiv = document.createElement("div");
        pageTextDiv.className = "page-text";
        pageTextDiv.id = `page-${page.page_number}`;

        // Use processed text (without headers/footers) if skip is enabled
        const textToUse = this.skipHeaderFooter
          ? page.processed_text
          : page.original_text;
        const wordsToUse = this.skipHeaderFooter
          ? page.words
          : this.extractWordsFromText(page.original_text);

        this.createWordElements(
          page.page_number - 1,
          textToUse,
          wordsToUse,
          pageTextDiv
        );

        pageDiv.appendChild(pageTextDiv);
      }

      pdfPagesContainer.appendChild(pageDiv);
    });
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
    return words;
  }

  private createWordElements(
    pageIndex: number,
    text: string,
    words: WordData[],
    container: HTMLElement
  ): void {
    let lastIndex = 0;

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
      wordElement.dataset.pageIndex = pageIndex.toString();
      wordElement.dataset.wordIndex = wordIndex.toString();
      wordElement.tabIndex = 0; // Make focusable for accessibility

      // Add click listener for jumping to word and auto-start
      wordElement.addEventListener("click", () => {
        this.jumpToWordAndPlay(pageIndex, wordIndex);
      });

      // Add keyboard support for word elements
      wordElement.addEventListener("keydown", (event) => {
        if (event.code === "Enter" || event.code === "Space") {
          event.preventDefault();
          this.jumpToWordAndPlay(pageIndex, wordIndex);
        }
      });

      container.appendChild(wordElement);
      this.wordElements.push(wordElement);

      lastIndex = wordData.end_pos;
    });

    // Add any remaining text after the last word
    if (lastIndex < text.length) {
      const remainingText = text.slice(lastIndex);
      container.appendChild(document.createTextNode(remainingText));
    }
  }

  private jumpToWordAndPlay(pageIndex: number, wordIndex: number): void {
    if (!this.isImageView && this.currentPDF) {
      // Stop current playback
      if (this.isPlaying) {
        this.handleStop();
      }

      // Set new position
      this.currentPageIndex = pageIndex;
      this.currentWordIndex = wordIndex;

      // Clear previous highlighting and show clicked start position
      this.clearHighlighting();
      const clickedWordElement = this.findWordElement(pageIndex, wordIndex);
      if (clickedWordElement) {
        clickedWordElement.classList.add("clicked-start");

        // Scroll to clicked word
        clickedWordElement.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }

      // Auto-start reading from this position
      this.isPlaying = true;
      this.isPaused = false;
      this.startReading();
      this.updateControlsState();

      const currentPage = this.currentPDF.pages[pageIndex];
      if (currentPage) {
        const wordsToUse = this.skipHeaderFooter
          ? currentPage.words
          : this.extractWordsFromText(currentPage.original_text);
        const targetWord = wordsToUse[wordIndex];

        if (targetWord) {
          this.updateStatus(
            `Started reading from page ${pageIndex + 1}, word: "${
              targetWord.word
            }"`
          );
        }
      }
    }
  }

  private handlePlay(): void {
    if (!this.currentPDF) return;

    if (this.isPaused) {
      this.speechSynthesis.resume();
      this.isPaused = false;
      this.updateControlsState();
      return;
    }

    this.isPlaying = true;
    this.startReading();
    this.updateControlsState();
  }

  private startReading(): void {
    if (
      !this.currentPDF ||
      this.currentPageIndex >= this.currentPDF.pages.length
    ) {
      this.handleStop();
      this.updateStatus("Finished reading the document.");
      return;
    }

    const currentPage = this.currentPDF.pages[this.currentPageIndex];
    if (!currentPage) {
      this.handleStop();
      return;
    }

    // Use processed or original text based on skip setting
    const wordsToUse = this.skipHeaderFooter
      ? currentPage.words
      : this.extractWordsFromText(currentPage.original_text);

    if (this.currentWordIndex >= wordsToUse.length) {
      this.currentPageIndex++;
      this.currentWordIndex = 0;
      this.startReading();
      return;
    }

    const currentWord = wordsToUse[this.currentWordIndex];
    if (!currentWord) {
      this.currentWordIndex++;
      this.startReading();
      return;
    }

    // Highlight current word (only in text view)
    if (!this.isImageView) {
      this.highlightCurrentWord();
    }

    this.currentUtterance = new SpeechSynthesisUtterance(currentWord.word);

    // Apply current speech rate (supports up to 5x speed)
    this.currentUtterance.rate = Math.min(this.speechRate, 10); // Browser limit protection
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
      if (this.isPlaying && !this.isPaused) {
        // Mark word as spoken (only in text view)
        if (!this.isImageView) {
          this.markWordAsSpoken();
        }
        this.currentWordIndex++;

        // Much shorter delay calculation - scales inversely with speed
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
      wordElement.classList.add("current-word");

      // Scroll to current word smoothly
      wordElement.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }

  private markWordAsSpoken(): void {
    const wordElement = this.findWordElement(
      this.currentPageIndex,
      this.currentWordIndex
    );
    if (wordElement) {
      wordElement.classList.remove("current-word");
      wordElement.classList.add("spoken-word");
    }
  }

  private findWordElement(
    pageIndex: number,
    wordIndex: number
  ): HTMLElement | null {
    return (
      this.wordElements.find(
        (element) =>
          element.dataset.pageIndex === pageIndex.toString() &&
          element.dataset.wordIndex === wordIndex.toString()
      ) || null
    );
  }

  private clearHighlighting(): void {
    this.wordElements.forEach((element) => {
      element.classList.remove("current-word", "spoken-word", "clicked-start");
    });
  }

  private handlePause(): void {
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
  }
}

export default PDFReaderApp;
