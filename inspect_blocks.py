import fitz

doc = fitz.open('d:/source_code/folder/CRM sales monthly september report.pdf')
page = doc[0]
with open('crm_blocks.txt', 'w', encoding='utf-8') as f:
    for b in page.get_text('blocks'):
        f.write(f"({b[0]:.1f}, {b[1]:.1f}, {b[2]:.1f}, {b[3]:.1f}) -> {repr(b[4])}\n")

print("Saved crm_blocks.txt")
