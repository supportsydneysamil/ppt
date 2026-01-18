#!/usr/bin/env python3
import argparse
import html
import ssl
import sys
import urllib.error
import urllib.request
from html.parser import HTMLParser


class BiblicsTextParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self._in_verse = False
        self._in_heading = False
        self._main_depth = 0
        self._current = []
        self._chunks = []

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        if tag == "div":
            class_value = attrs_dict.get("class", "")
            if "chapter-content" in class_value.split():
                self._main_depth += 1
            elif self._main_depth > 0:
                self._main_depth += 1
        if self._main_depth <= 0:
            return
        if tag == "p" and attrs_dict.get("class") == "verse":
            self._flush_current()
            self._in_verse = True
        elif tag == "h3":
            self._flush_current()
            self._in_heading = True

    def handle_endtag(self, tag):
        if tag == "div" and self._main_depth > 0:
            self._main_depth -= 1
        if tag == "p" and self._in_verse:
            self._in_verse = False
            self._flush_current()
        elif tag == "h3" and self._in_heading:
            self._in_heading = False
            self._flush_current()

    def handle_data(self, data):
        if self._in_verse or self._in_heading:
            self._current.append(data)

    def _flush_current(self):
        if not self._current:
            return
        text = html.unescape("".join(self._current)).strip()
        if text:
            self._chunks.append(text)
        self._current = []

    def get_text(self):
        self._flush_current()
        return "\n".join(self._chunks)


def fetch_html(url, timeout, insecure):
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; text-extractor/1.0)"},
    )
    context = None
    if insecure:
        context = ssl._create_unverified_context()
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=context) as resp:
            charset = resp.headers.get_content_charset() or "utf-8"
            return resp.read().decode(charset, errors="replace")
    except urllib.error.URLError as exc:
        raise exc


def main():
    parser = argparse.ArgumentParser(
        description="Extract verse text from a Biblics chapter page."
    )
    parser.add_argument("url", help="Biblics chapter URL")
    parser.add_argument(
        "-o",
        "--out",
        help="Output file path (defaults to stdout)",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=20,
        help="Network timeout in seconds",
    )
    parser.add_argument(
        "--insecure",
        action="store_true",
        help="Disable TLS certificate verification",
    )
    args = parser.parse_args()

    html_doc = fetch_html(args.url, args.timeout, args.insecure)
    parser = BiblicsTextParser()
    parser.feed(html_doc)
    text = parser.get_text()

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(text)
            f.write("\n")
    else:
        sys.stdout.write(text)
        sys.stdout.write("\n")


if __name__ == "__main__":
    main()
