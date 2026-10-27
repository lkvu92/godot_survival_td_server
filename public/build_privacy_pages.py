"""Render the reviewed Markdown privacy documents to standalone static pages."""
from html import escape
from pathlib import Path

import markdown


ROOT = Path(__file__).resolve().parent
STYLE = """
:root { color-scheme: light; font: 17px/1.7 system-ui, sans-serif; color: #202b38; background: #f4f6f8; }
body { margin: 0; } main { max-width: 960px; margin: 28px auto; padding: 28px 36px; background: white; border-radius: 12px; }
nav { display: flex; gap: 18px; flex-wrap: wrap; padding-bottom: 18px; border-bottom: 1px solid #d6dde5; }
a { color: #145b9e; overflow-wrap: anywhere; } a:focus-visible { outline: 3px solid #e5a000; outline-offset: 3px; }
h1 { font-size: 1.9rem; line-height: 1.3; } h2 { font-size: 1.25rem; margin-top: 2rem; }
section { scroll-margin-top: 20px; } section + section { border-top: 2px solid #d6dde5; margin-top: 48px; padding-top: 28px; }
table { width: 100%; border-collapse: collapse; font-size: .94rem; } th, td { border: 1px solid #d6dde5; padding: 12px; text-align: left; vertical-align: top; }
th { background: #eef3f8; } code { overflow-wrap: anywhere; } li { margin: .5rem 0; }
@media (max-width: 640px) { main { margin: 0; padding: 20px 16px; border-radius: 0; } h1 { font-size: 1.55rem; } th, td { padding: 7px; } }
@media print { :root { background: white; font-size: 11pt; } main { max-width: none; padding: 0; margin: 0; } nav { display: none; } }
"""


def render(source):
    return markdown.markdown(source, extensions=["tables", "sane_lists"], output_format="html")


def page(title, navigation, sections):
    return f'''<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="{escape(title, quote=True)}">
<title>{escape(title)}</title>
<style>{STYLE}</style>
</head>
<body><main><nav aria-label="Ngôn ngữ và tài liệu / Languages and documents">{navigation}</nav>
{sections}
</main></body>
</html>
'''


def main():
    policy_dir = ROOT / "privacy-policy"
    sections = "\n".join(
        f'<section id="{lang}" lang="{lang}">{render((policy_dir / filename).read_text(encoding="utf-8"))}</section>'
        for lang, filename in [("vi", "policy.vi.md"), ("en", "policy.en.md")]
    )
    policy_dir.joinpath("index.html").write_text(page(
        "Chính sách quyền riêng tư / Privacy Policy — Thông Thiên Lộ",
        '<a href="#vi" lang="vi">Tiếng Việt</a><a href="#en" lang="en">English</a><a href="../delete-account/index.html">Xóa tài khoản / Delete account</a>',
        sections,
    ), encoding="utf-8")
    deletion_dir = ROOT / "delete-account"
    vi, en = deletion_dir.joinpath("instructions.md").read_text(encoding="utf-8").split("\n---\n", 1)
    deletion_dir.joinpath("index.html").write_text(page(
        "Xóa tài khoản / Account deletion — Thông Thiên Lộ",
        '<a href="#vi" lang="vi">Tiếng Việt</a><a href="#en" lang="en">English</a><a href="../privacy-policy/index.html">Chính sách / Privacy policy</a>',
        f'<section id="vi" lang="vi">{render(vi)}</section>\n<section id="en" lang="en">{render(en)}</section>',
    ), encoding="utf-8")
    print("Generated privacy-policy/index.html and delete-account/index.html")


if __name__ == "__main__":
    main()
