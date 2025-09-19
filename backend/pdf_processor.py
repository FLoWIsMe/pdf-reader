import PyPDF2
import fitz  # PyMuPDF
from pdf2image import convert_from_path
from typing import List, Dict, Tuple
import re
import base64
import io
from collections import Counter
import os


class PDFProcessor:
    def __init__(self):
        self.current_pdf = None
        self.pages_text = []

    def extract_text_and_images_from_pdf(self, pdf_file_path: str) -> Dict:
        """Extract text, images, and detect headers/footers from PDF"""
        try:
            # Convert PDF pages to images
            images = convert_from_path(pdf_file_path, dpi=150)

            # Open PDF with PyMuPDF for better text extraction
            pdf_document = fitz.open(pdf_file_path)

            pages_data = []
            all_page_lines = []

            # First pass: collect all text to analyze headers/footers
            for page_num in range(len(pdf_document)):
                page = pdf_document[page_num]
                text = page.get_text()
                lines = [line.strip() for line in text.split("\n") if line.strip()]
                all_page_lines.append(lines)

            # Detect common headers and footers
            header_patterns, footer_patterns = self._detect_headers_footers(
                all_page_lines
            )

            # Second pass: process each page
            for page_num in range(len(pdf_document)):
                page = pdf_document[page_num]

                # Get text with position information
                text_dict = page.get_text("dict")
                full_text = page.get_text()

                # Convert page image to base64
                page_image = images[page_num]
                img_buffer = io.BytesIO()
                page_image.save(img_buffer, format="PNG")
                img_base64 = base64.b64encode(img_buffer.getvalue()).decode()

                # Process text and remove headers/footers
                processed_text, words = self._process_page_text(
                    full_text, text_dict, header_patterns, footer_patterns
                )

                pages_data.append(
                    {
                        "page_number": page_num + 1,
                        "original_text": full_text,
                        "processed_text": processed_text,
                        "words": words,
                        "image": img_base64,
                        "has_header_footer_removal": len(processed_text)
                        < len(full_text),
                    }
                )

            pdf_document.close()

            return {
                "success": True,
                "total_pages": len(pages_data),
                "pages": pages_data,
                "header_patterns": list(header_patterns),
                "footer_patterns": list(footer_patterns),
            }

        except Exception as e:
            return {"success": False, "error": str(e)}

    def _detect_headers_footers(
        self, all_page_lines: List[List[str]]
    ) -> Tuple[set, set]:
        """Detect common headers and footers across pages"""
        if len(all_page_lines) < 2:
            return set(), set()

        # Analyze first few lines (potential headers) and last few lines (potential footers)
        first_lines = []
        last_lines = []

        for lines in all_page_lines:
            if len(lines) >= 3:
                # Consider first 3 lines as potential headers
                first_lines.extend(lines[:3])
                # Consider last 3 lines as potential footers
                last_lines.extend(lines[-3:])

        # Find lines that appear frequently (likely headers/footers)
        first_line_counts = Counter(first_lines)
        last_line_counts = Counter(last_lines)

        # Consider a line as header/footer if it appears on at least 30% of pages
        min_frequency = max(2, len(all_page_lines) * 0.3)

        headers = set()
        footers = set()

        for line, count in first_line_counts.items():
            if count >= min_frequency and self._is_likely_header_footer(line):
                headers.add(line)

        for line, count in last_line_counts.items():
            if count >= min_frequency and self._is_likely_header_footer(line):
                footers.add(line)

        return headers, footers

    def _is_likely_header_footer(self, line: str) -> bool:
        """Determine if a line is likely to be a header or footer"""
        line_lower = line.lower().strip()

        # Skip very short lines or very long lines
        if len(line_lower) < 3 or len(line_lower) > 100:
            return False

        # Common header/footer indicators
        header_footer_indicators = [
            # Page numbers
            r"^\d+$",  # Just a number
            r"page\s+\d+",  # "Page 1"
            r"\d+\s+of\s+\d+",  # "1 of 10"
            # Common header/footer content
            r"chapter\s+\d+",
            r"©.*\d{4}",  # Copyright
            r"confidential",
            r"proprietary",
            r"draft",
            r"internal use",
            # Website/email patterns
            r"www\.",
            r"@.*\.com",
            r"\.pdf$",
            # Date patterns
            r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}",
        ]

        for pattern in header_footer_indicators:
            if re.search(pattern, line_lower):
                return True

        return False

    def _process_page_text(
        self,
        full_text: str,
        text_dict: Dict,
        header_patterns: set,
        footer_patterns: set,
    ) -> Tuple[str, List[Dict]]:
        """Process page text to remove headers/footers and extract words"""
        lines = full_text.split("\n")
        filtered_lines = []

        for line in lines:
            line_stripped = line.strip()
            if (
                line_stripped
                and line_stripped not in header_patterns
                and line_stripped not in footer_patterns
            ):
                filtered_lines.append(line)

        processed_text = "\n".join(filtered_lines)
        words = self._extract_words_with_positions(processed_text)

        return processed_text, words

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
