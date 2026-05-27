## Sprint 56: 类目管理导入支持 xlsx/xls 文件格式

### Features
- Category management import UI accepts `.csv`, `.xlsx`, and `.xls` files in the file picker/upload control.
- Backend category import parsing supports CSV, XLSX, and XLS workbook formats using the existing CSV import behavior as the reference contract for headers, rows, validation, and created category records.
- Failed spreadsheet parsing returns a clear user-visible error message that identifies unsupported, malformed, or unreadable files without silently ignoring the failure.

### Success criteria (black-box-verifiable)
- [ ] The category management import file picker accepts CSV, XLSX, and XLS files.
  Evaluator steps:
  1. Start the system with `bash init.sh` and open `http://localhost:5173/standard/categories`.
  2. Open the category import control and inspect the native upload input or file chooser configuration from the browser surface.
  3. Assert the upload control accepts `.csv`, `.xlsx`, and `.xls` file extensions.

- [ ] Importing an XLSX workbook creates the same visible category rows as an equivalent CSV import.
  Evaluator steps:
  1. Start the system with `bash init.sh` and open `http://localhost:5173/standard/categories`.
  2. Prepare a valid `.xlsx` workbook with the same category-import columns and rows used by the existing CSV import flow, then upload it through the category import control.
  3. Assert the import reports success and the imported category rows are visible in the category table/tree at `http://localhost:5173/standard/categories`.

- [ ] Importing an XLS workbook creates the same visible category rows as an equivalent CSV import.
  Evaluator steps:
  1. Start the system with `bash init.sh` and open `http://localhost:5173/standard/categories`.
  2. Prepare a valid `.xls` workbook with the same category-import columns and rows used by the existing CSV import flow, then upload it through the category import control.
  3. Assert the import reports success and the imported category rows are visible in the category table/tree at `http://localhost:5173/standard/categories`.

- [ ] Malformed spreadsheet imports show a clear error message.
  Evaluator steps:
  1. Start the system with `bash init.sh` and open `http://localhost:5173/standard/categories`.
  2. Upload a malformed `.xlsx` file or a workbook missing the required category-import columns through the category import control.
  3. Assert the UI shows a clear import failure message and no partial category rows from the malformed file appear in the category table/tree.

---

CONTRACT APPROVED
