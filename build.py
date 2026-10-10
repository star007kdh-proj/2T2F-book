#!/usr/bin/env python3
"""Build the static 2T2F book from src/book.md.

Usage: python build.py
Output: index.html, chapters/chN.html (figures/ and assets/ are used as-is).
"""
import html
import io
import os
import re

import sys

import markdown

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src", "book.md")
SITE_TITLE = "2T2F Book"
SITE_SUBTITLE = "한 사이클에 두 블록: 2-taken과 2-fetch 교과서"
REPO_URL = "https://github.com/star007kdh-proj/2T2F-book"

# 실험 N -> widget id (inserted right after the experiment heading)
WIDGETS = {1: "supply", 3: "conf", 4: "phr", 5: "guard", 6: "meta", 7: "model"}

MD_EXT = ["tables", "md_in_html", "sane_lists", "attr_list"]


def split_chapters(text):
    """Return (front, [(num, title, body), ...]). Chapters are separated by '---' + '## N장 · 제목'."""
    parts = re.split(r"\n---\n\n(?=## (?:\d+장|들어가며) · )", text)
    front = parts[0]
    chapters = []
    for part in parts[1:]:
        m = re.match(r"## (\d+장|들어가며) · (.+)\n", part)
        num = 0 if m.group(1) == "들어가며" else int(m.group(1)[:-1])
        title = m.group(2).strip()
        body = part[m.end():]
        chapters.append((num, title, body))
    return front, chapters


def insert_widgets(body):
    def repl(m):
        n = int(m.group(1))
        w = WIDGETS.get(n)
        tag = f'\n\n<div class="widget" data-widget="{w}"></div>\n' if w else ""
        return m.group(0) + tag
    return re.sub(r"### 실험 (\d+) · [^\n]+\n", repl, body)


def demote(body):
    """Chapter body headings: ### -> h2, #### -> h3 (chapter title itself becomes h1)."""
    return re.sub(r"^(#{3,})", lambda m: "#" * (len(m.group(1)) - 1), body, flags=re.M)


def render_md(md_text):
    md_text = md_text.replace("<details><summary>", '<details markdown="1"><summary>')
    return markdown.markdown(md_text, extensions=MD_EXT)


def chap_label(num):
    return "들어가며" if num == 0 else f"{num}장"


def nav_html(chapters, current, depth):
    pre = "../" if depth else ""
    items = [f'<li><a href="{pre}index.html"{" class=cur" if current == -1 else ""}>이 책을 읽는 법</a></li>']
    for num, title, _ in chapters:
        cls = " class=cur" if current == num else ""
        items.append(f'<li><a href="{pre}chapters/ch{num}.html"{cls}><span class="n">{chap_label(num)}</span> {html.escape(title)}</a></li>')
    return "<ul>" + "".join(items) + "</ul>"


def page(title, topline, body_html, chapters, current, depth, prev_next):
    pre = "../" if depth else ""
    nav = nav_html(chapters, current, depth)
    pn = []
    if prev_next[0]:
        pn.append(f'<a class="prev" href="{pre}{prev_next[0][0]}">← {html.escape(prev_next[0][1])}</a>')
    if prev_next[1]:
        pn.append(f'<a class="next" href="{pre}{prev_next[1][0]}">{html.escape(prev_next[1][1])} →</a>')
    return f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(SITE_SUBTITLE)}">
<link rel="stylesheet" href="{pre}assets/book.css">
</head>
<body>
<header class="top">
  <button class="menu" aria-label="목차" onclick="document.body.classList.toggle('nav-open')">☰</button>
  <a class="brand" href="{pre}index.html">{SITE_TITLE}</a>
  <span class="topline">{html.escape(topline)}</span>
</header>
<div class="layout">
<nav class="side">
  <div class="side-title">{html.escape(SITE_SUBTITLE)}</div>
  {nav}
  <div class="side-foot"><a href="{REPO_URL}">소스</a></div>
</nav>
<main class="content">
{body_html}
<div class="prevnext">{"".join(pn)}</div>
</main>
</div>
<script src="{pre}assets/book.js"></script>
</body>
</html>
"""


def main():
    text = io.open(SRC, encoding="utf-8").read()
    front, chapters = split_chapters(text)

    # ---- index ----
    front_md = re.sub(r"^# (.+)$", r"# \1", front, count=1, flags=re.M)
    front_md = front_md.replace("## 이 책을 읽는 법", "## 이 책을 읽는 법")
    # link chapter table rows to pages
    def link_row(m):
        num = 0 if m.group(1) == "들어가며" else int(m.group(1))
        return f'| [{m.group(1)}](chapters/ch{num}.html) | [{m.group(2)}](chapters/ch{num}.html) |'
    front_md = re.sub(r"^\| (\d+|들어가며) \| ([^|]+?) \|", link_row, front_md, flags=re.M)
    front_html = render_md(front_md)
    first = chapters[0]
    out = page(f"{SITE_TITLE} · {SITE_SUBTITLE}", "이 책을 읽는 법", front_html, chapters, -1, 0,
               (None, (f"chapters/ch{first[0]}.html", f"{chap_label(first[0])} · {first[1]}")))
    io.open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8", newline="\n").write(out)

    # ---- chapters ----
    os.makedirs(os.path.join(ROOT, "chapters"), exist_ok=True)
    for i, (num, title, body) in enumerate(chapters):
        body = insert_widgets(body)
        body = demote(body)
        body = body.replace("](figures/", "](../figures/")
        body_md = f"# {chap_label(num)} · {title}\n" + body
        body_html = render_md(body_md)
        prev = ("index.html", "이 책을 읽는 법") if i == 0 else (f"chapters/ch{chapters[i-1][0]}.html", f"{chap_label(chapters[i-1][0])} · {chapters[i-1][1]}")
        nxt = None if i == len(chapters) - 1 else (f"chapters/ch{chapters[i+1][0]}.html", f"{chap_label(chapters[i+1][0])} · {chapters[i+1][1]}")
        out = page(f"{chap_label(num)} · {title} — {SITE_TITLE}", f"{chap_label(num)} · {title}", body_html, chapters, num, 1, (prev, nxt))
        io.open(os.path.join(ROOT, "chapters", f"ch{num}.html"), "w", encoding="utf-8", newline="\n").write(out)
        print(f"ch{num}: {title}")
    print("index.html")


if __name__ == "__main__":
    main()
