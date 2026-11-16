"""Generate a temporary XLSX from the anonymized test fixture, never real identities."""
import json
import zipfile
from xml.sax.saxutils import escape, quoteattr


def write_fixture(source, destination):
    sheets = json.loads(source.read_text())
    ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    package_rel = 'http://schemas.openxmlformats.org/package/2006/relationships'
    with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as archive:
        workbook_sheets, relationships = [], []
        overrides = []
        for i, (name, sheet) in enumerate(sheets.items(), 1):
            workbook_sheets.append(f'<sheet name={quoteattr(name)} sheetId="{i}" r:id="rId{i}"/>')
            relationships.append(f'<Relationship Id="rId{i}" Type="{rel}/worksheet" Target="worksheets/sheet{i}.xml"/>')
            overrides.append(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>')
            rows = []
            for row_number, cells in sheet['rows'].items():
                rendered = []
                for col, value in cells.items():
                    address = f'{col}{row_number}'
                    if isinstance(value, (int, float)):
                        rendered.append(f'<c r="{address}"><v>{value}</v></c>')
                    else:
                        rendered.append(f'<c r="{address}" t="inlineStr"><is><t xml:space="preserve">{escape(str(value))}</t></is></c>')
                rows.append(f'<row r="{row_number}">{"".join(rendered)}</row>')
            archive.writestr(f'xl/worksheets/sheet{i}.xml', f'<worksheet xmlns="{ns}"><sheetData>{"".join(rows)}</sheetData></worksheet>')
        archive.writestr('xl/workbook.xml', f'<workbook xmlns="{ns}" xmlns:r="{rel}"><sheets>{"".join(workbook_sheets)}</sheets></workbook>')
        archive.writestr('xl/_rels/workbook.xml.rels', f'<Relationships xmlns="{package_rel}">{"".join(relationships)}</Relationships>')
        archive.writestr('_rels/.rels', f'<Relationships xmlns="{package_rel}"><Relationship Id="rId1" Type="{rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        archive.writestr('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' + ''.join(overrides) + '</Types>')
