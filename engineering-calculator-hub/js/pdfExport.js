// pdfExport.js — builds a professional calculation report PDF.
// Loads jsPDF lazily from CDN on first use.

let jsPDFReady = null;
function loadJsPDF() {
  if (jsPDFReady) return jsPDFReady;
  jsPDFReady = new Promise((resolve, reject) => {
    if (window.jspdf) return resolve(window.jspdf.jsPDF);
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.onload = () => resolve(window.jspdf.jsPDF);
    script.onerror = () => reject(new Error('Could not load PDF library — check your internet connection.'));
    document.head.appendChild(script);
  });
  return jsPDFReady;
}

function flattenObject(obj, out = {}, prefix = '') {
  if (obj === null || obj === undefined) return out;
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flattenObject(v, out, `${prefix}${k}.`);
    } else {
      out[`${prefix}${k}`] = v;
    }
  }
  return out;
}

/**
 * @param {object} opts
 * @param {string} opts.calculatorName
 * @param {object} opts.inputs
 * @param {object} opts.result
 * @param {object} [opts.assumptions]
 * @param {string} [opts.formula]
 * @param {string} [opts.projectName]
 */
export async function exportCalculationPDF(opts) {
  const { calculatorName, inputs, result, assumptions, formula, projectName = 'Untitled Project' } = opts;
  const jsPDF = await loadJsPDF();
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 48;
  let y = margin;
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Engineering Calculator Hub', margin, y);
  y += 22;
  doc.setFontSize(12);
  doc.setTextColor(90);
  doc.text(calculatorName || 'Calculation Report', margin, y);
  y += 24;

  doc.setDrawColor(210);
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;

  doc.setFontSize(9.5);
  doc.setTextColor(60);
  doc.setFont('helvetica', 'normal');
  doc.text(`Project: ${projectName}`, margin, y); y += 14;
  doc.text(`Calculator: ${calculatorName}`, margin, y); y += 14;
  doc.text(`Date/time: ${new Date().toLocaleString()}`, margin, y); y += 22;

  function section(title) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(20);
    doc.text(title, margin, y); y += 6;
    doc.setDrawColor(230); doc.line(margin, y, pageWidth - margin, y); y += 14;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(60);
  }
  function kvTable(obj) {
    const flat = flattenObject(obj);
    for (const [k, v] of Object.entries(flat)) {
      if (y > 760) { doc.addPage(); y = margin; }
      const label = k.replace(/([A-Z])/g, ' $1').replace(/^\w/, (c) => c.toUpperCase());
      doc.setTextColor(90); doc.text(`${label}:`, margin, y);
      doc.setTextColor(20); doc.text(String(v), margin + 220, y);
      y += 14;
    }
    y += 8;
  }

  section('Input');
  kvTable(inputs || {});

  if (formula) {
    section('Calculation');
    doc.setFont('courier', 'normal');
    doc.text(formula, margin, y, { maxWidth: pageWidth - margin * 2 });
    doc.setFont('helvetica', 'normal');
    y += 26;
  }

  section('Result');
  kvTable(result || {});

  if (assumptions) {
    section('Assumptions Used');
    kvTable(assumptions);
  }

  section('Engineering Disclaimer');
  doc.setFontSize(8.5); doc.setTextColor(110);
  const disclaimer = 'This application is intended for engineering education, preliminary calculations, estimation, and reference purposes. Results should be verified against approved engineering standards, manufacturer data, plant design documents, calibrated instruments, and qualified engineering personnel before being used for operational, safety, or design decisions.';
  doc.text(disclaimer, margin, y, { maxWidth: pageWidth - margin * 2 });

  const fname = `${(calculatorName || 'calculation').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}.pdf`;
  doc.save(fname);
}
