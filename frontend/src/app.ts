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
  private currentPageIndex = 0;
  private currentWordIndex = 0;

  constructor() {
    this.speechSynthesis = window.speechSynthesis;
    this.initializeEventListeners();
  }

  private initializeEventListeners(): void {
    const uploadBtn = document.getElementById("uploadBtn") as HTMLButtonElement;
    const pdfInput = document.getElementById("pdfInput") as HTMLInputElement;
    const playBtn = document.getElementById("playBtn") as HTMLButtonElement;
    const pauseBtn = document.getElementById("pauseBtn") as HTMLButtonElement;
    const stopBtn = document.getElementById("stopBtn") as HTMLButtonElement;

    uploadBtn.addEventListener("click", () => this.handleUpload());
    playBtn.addEventListener("click", () => this.handlePlay());
    pauseBtn.addEventListener("click", () => this.handlePause());
    stopBtn.addEventListener("click", () => this.handleStop());
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
      this.updateStatus(
        "PDF loaded successfully. Click Play to start reading."
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

    this.currentPDF.pages.forEach((page) => {
      const pageDiv = document.createElement("div");
      pageDiv.className = "page";
      pageDiv.innerHTML = `
                <h3>Page ${page.page_number}</h3>
                <div class="page-text" id="page-${page.page_number}">${page.text}</div>
            `;
      pdfPagesContainer.appendChild(pageDiv);
    });
  }

  private handlePlay(): void {
    if (!this.currentPDF) return;

    if (this.isPlaying) {
      this.speechSynthesis.resume();
      return;
    }

    this.startReading();
  }

  private startReading(): void {
    if (
      !this.currentPDF ||
      this.currentPageIndex >= this.currentPDF.pages.length
    )
      return;

    const currentPage = this.currentPDF.pages[this.currentPageIndex];
    const words = currentPage.words;

    if (this.currentWordIndex >= words.length) {
      this.currentPageIndex++;
      this.currentWordIndex = 0;
      this.startReading();
      return;
    }

    const currentWord = words[this.currentWordIndex];
    this.currentUtterance = new SpeechSynthesisUtterance(currentWord.word);

    this.currentUtterance.rate = 1.0;
    this.currentUtterance.pitch = 1.0;
    this.currentUtterance.volume = 1.0;

    this.currentUtterance.onend = () => {
      this.currentWordIndex++;
      this.startReading();
    };

    this.currentUtterance.onerror = (error) => {
      console.error("Speech synthesis error:", error);
      this.updateStatus("Error during speech synthesis");
    };

    this.speechSynthesis.speak(this.currentUtterance);
    this.isPlaying = true;
    this.updateControlsState();
  }

  private handlePause(): void {
    if (this.speechSynthesis.speaking) {
      this.speechSynthesis.pause();
    }
  }

  private handleStop(): void {
    this.speechSynthesis.cancel();
    this.isPlaying = false;
    this.currentPageIndex = 0;
    this.currentWordIndex = 0;
    this.updateControlsState();
    this.updateStatus("Reading stopped");
  }

  private enableControls(): void {
    const playBtn = document.getElementById("playBtn") as HTMLButtonElement;
    const pauseBtn = document.getElementById("pauseBtn") as HTMLButtonElement;
    const stopBtn = document.getElementById("stopBtn") as HTMLButtonElement;

    playBtn.disabled = false;
    pauseBtn.disabled = false;
    stopBtn.disabled = false;
  }

  private updateControlsState(): void {
    const playBtn = document.getElementById("playBtn") as HTMLButtonElement;
    const pauseBtn = document.getElementById("pauseBtn") as HTMLButtonElement;

    if (this.isPlaying) {
      playBtn.textContent = "Resume";
      pauseBtn.disabled = false;
    } else {
      playBtn.textContent = "Play";
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
