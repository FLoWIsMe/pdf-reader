import axios from "axios";

interface WordData {
  word: string;
  start_pos: number;
  end_pos: number;
}

interface PageData {
  page_number: number;
  text: string;
  words: WordData[];
}

interface PDFData {
  success: boolean;
  total_pages: number;
  pages: PageData[];
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

    uploadBtn.addEventListener("click", () => this.handleUpload());
    playBtn.addEventListener("click", () => this.handlePlay());
    pauseBtn.addEventListener("click", () => this.handlePause());
    stopBtn.addEventListener("click", () => this.handleStop());
    speedRange.addEventListener("input", (e) => this.handleSpeedChange(e));
  }

  private initializeKeyboardShortcuts(): void {
    document.addEventListener("keydown", (event) => {
      // Only handle spacebar if we're not typing in an input field
      if (
        event.code === "Space" &&
        event.target instanceof HTMLElement &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)
      ) {
        event.preventDefault();
        this.togglePlayPause();
      }
    });

    // Activate keyboard shortcuts when PDF is loaded
    this.keyboardListenerActive = true;
  }

  private togglePlayPause(): void {
    if (!this.currentPDF || !this.keyboardListenerActive) return;

    const playBtn = document.getElementById("playBtn") as HTMLButtonElement;
    const pauseBtn = document.getElementById("pauseBtn") as HTMLButtonElement;

    if (!this.isPlaying) {
      // Start playing
      if (!playBtn.disabled) {
        this.handlePlay();
      }
    } else if (!this.isPaused) {
      // Pause if currently playing
      if (!pauseBtn.disabled) {
        this.handlePause();
      }
    } else {
      // Resume if paused
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
      this.updateStatus(
        "PDF loaded successfully. Click Play or press Spacebar to start reading."
      );
    } catch (error) {
      console.error("Upload error:", error);
      this.updateStatus("Error uploading PDF. Please try again.");
    }
  }

  private renderPDF(): void {
    if (!this.currentPDF) return;

    const pdfPagesContainer = document.getElementById("pdfPages");
    if (!pdfPagesContainer) return;

    pdfPagesContainer.innerHTML = "";
    this.wordElements = [];

    this.currentPDF.pages.forEach((page) => {
      const pageDiv = document.createElement("div");
      pageDiv.className = "page";

      const pageHeader = document.createElement("h3");
      pageHeader.textContent = `Page ${page.page_number}`;
      pageDiv.appendChild(pageHeader);

      const pageTextDiv = document.createElement("div");
      pageTextDiv.className = "page-text";
      pageTextDiv.id = `page-${page.page_number}`;

      // Create clickable word elements
      this.createWordElements(page, pageTextDiv);

      pageDiv.appendChild(pageTextDiv);
      pdfPagesContainer.appendChild(pageDiv);
    });
  }

  private createWordElements(page: PageData, container: HTMLElement): void {
    const text = page.text;
    let lastIndex = 0;

    page.words.forEach((wordData, wordIndex) => {
      // Add any text before this word (spaces, punctuation, etc.)
      if (wordData.start_pos > lastIndex) {
        const beforeText = text.slice(lastIndex, wordData.start_pos);
        container.appendChild(document.createTextNode(beforeText));
      }

      // Create word element
      const wordElement = document.createElement("span");
      wordElement.className = "word";
      wordElement.textContent = wordData.word;
      wordElement.dataset.pageIndex = (page.page_number - 1).toString();
      wordElement.dataset.wordIndex = wordIndex.toString();
      wordElement.tabIndex = 0; // Make focusable for accessibility

      // Add click listener for jumping to word and auto-start
      wordElement.addEventListener("click", () => {
        this.jumpToWordAndPlay(page.page_number - 1, wordIndex);
      });

      // Add keyboard support for word elements
      wordElement.addEventListener("keydown", (event) => {
        if (event.code === "Enter" || event.code === "Space") {
          event.preventDefault();
          this.jumpToWordAndPlay(page.page_number - 1, wordIndex);
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

    this.updateStatus(
      `Started reading from page ${pageIndex + 1}, word: "${
        this.currentPDF?.pages[pageIndex].words[wordIndex].word
      }"`
    );
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
    const words = currentPage.words;

    if (this.currentWordIndex >= words.length) {
      this.currentPageIndex++;
      this.currentWordIndex = 0;
      this.startReading();
      return;
    }

    const currentWord = words[this.currentWordIndex];

    // Highlight current word
    this.highlightCurrentWord();

    this.currentUtterance = new SpeechSynthesisUtterance(currentWord.word);

    // Apply current speech rate (supports up to 5x speed)
    this.currentUtterance.rate = Math.min(this.speechRate, 10); // Browser limit protection
    this.currentUtterance.pitch = 1.0;
    this.currentUtterance.volume = 1.0;

    this.currentUtterance.onstart = () => {
      this.updateStatus(
        `Reading page ${this.currentPageIndex + 1}: "${currentWord.word}" (${
          this.speechRate
        }x speed)`
      );
    };

    this.currentUtterance.onend = () => {
      if (this.isPlaying && !this.isPaused) {
        // Mark word as spoken
        this.markWordAsSpoken();
        this.currentWordIndex++;

        // Much shorter delay calculation - scales inversely with speed
        // At 1x speed: ~20ms delay
        // At 2x speed: ~10ms delay
        // At 5x speed: ~4ms delay
        // const delay = Math.max(2, Math.round(20 / this.speechRate)); // This one is a little slower
        const delay = Math.max(
          1,
          Math.round(15 / Math.pow(this.speechRate, 1.8))
        );

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
      // Reduced delay for speed changes
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

    playBtn.disabled = false;
    pauseBtn.disabled = false;
    stopBtn.disabled = false;
    speedRange.disabled = false;
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
