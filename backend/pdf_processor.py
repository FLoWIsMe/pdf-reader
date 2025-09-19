import PyPDF2
from typing import List, Dict
import re


class PDFProcessor:
    def __init__(self):
        self.current_pdf = None
        self.pages_text = []

    def extract_text_from_pdf(self, pdf_file_path: str) -> Dict:
        """Extract text from PDF and return structured data"""
        try:
            with open(pdf_file_path, "rb") as file:
                pdf_reader = PyPDF2.PdfReader(file)
                pages_data = []

                for page_num, page in enumerate(pdf_reader.pages):
                    text = page.extract_text()
                    words = self._extract_words_with_positions(text)
                    pages_data.append(
                        {"page_number": page_num + 1, "text": text, "words": words}
                    )

                return {
                    "success": True,
                    "total_pages": len(pdf_reader.pages),
                    "pages": pages_data,
                }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def _extract_words_with_positions(self, text: str) -> List[Dict]:
        """Extract individual words with their positions in the text"""
        words = []
        word_pattern = re.compile(r"\b\w+\b")

        for match in word_pattern.finditer(text):
            words.append(
                {
                    "word": match.group(),
                    "start_pos": match.start(),
                    "end_pos": match.end(),
                }
            )

        return words

    def get_words_from_position(self, page_number: int, position: int) -> List[Dict]:
        """Get words starting from a specific position in the text"""
        if page_number > len(self.pages_text):
            return []

        page_data = self.pages_text[page_number - 1]
        words = page_data.get("words", [])

        # Find words starting from the given position
        result_words = []
        for word_data in words:
            if word_data["start_pos"] >= position:
                result_words.append(word_data)

        return result_words
