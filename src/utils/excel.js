export async function downloadWorkbook(sheets, filename) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  for (const { name, rows } of sheets) {
    const worksheet = workbook.addWorksheet(name);
    const headers = [...new Set((rows || []).flatMap((row) => Object.keys(row)))];
    if (headers.length) {
      worksheet.columns = headers.map((header) => ({ header, key: header }));
      worksheet.addRows(rows);
      worksheet.getRow(1).font = { bold: true };
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    }
  }
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
