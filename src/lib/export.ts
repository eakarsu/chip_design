/**
 * Export utilities for algorithm results
 * Supports CSV, JSON, and PDF formats
 */

import { AlgorithmResponse } from '@/types/algorithms';

/**
 * Export algorithm results as JSON
 */
export function exportToJSON(result: AlgorithmResponse, filename?: string): void {
  const jsonString = JSON.stringify(result, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  downloadBlob(blob, filename || `algorithm-result-${Date.now()}.json`);
}

/**
 * Export algorithm results as CSV
 */
export function exportToCSV(result: AlgorithmResponse, filename?: string): void {
  const { category, algorithm, result: data, metadata } = result;

  // Build CSV content
  let csvContent = 'Category,Algorithm,Metric,Value\n';

  // Add metadata
  csvContent += `Metadata,Timestamp,${metadata.timestamp}\n`;
  csvContent += `Metadata,Version,${metadata.version}\n`;
  csvContent += `Metadata,Runtime,${metadata.runtime}ms\n`;
  csvContent += `\n`;

  // Add algorithm-specific metrics
  Object.entries(data).forEach(([key, value]) => {
    if (typeof value === 'object' && value !== null) {
      // Handle nested objects (arrays, etc.)
      if (Array.isArray(value)) {
        csvContent += `${category},${algorithm},${key},${value.length} items\n`;
      } else {
        csvContent += `${category},${algorithm},${key},[object]\n`;
      }
    } else {
      csvContent += `${category},${algorithm},${key},${value}\n`;
    }
  });

  const blob = new Blob([csvContent], { type: 'text/csv' });
  downloadBlob(blob, filename || `algorithm-result-${Date.now()}.csv`);
}

/**
 * Export algorithm results as detailed CSV (includes arrays)
 */
export function exportToDetailedCSV(result: AlgorithmResponse, filename?: string): void {
  const { category, algorithm, result: data } = result;

  let csvContent = '';

  // Handle different result types
  const anyData = data as any;

  if (category === 'placement' || category === 'floorplanning') {
    // Export cells data
    csvContent = 'ID,Name,Width,Height,X,Y,Type\n';
    const cells = anyData.cells || anyData.blocks || [];
    cells.forEach((cell: any) => {
      csvContent += `${cell.id},${cell.name},${cell.width},${cell.height},${cell.position?.x || 0},${cell.position?.y || 0},${cell.type}\n`;
    });
  } else if (category === 'routing') {
    // Export wires data
    csvContent = 'Wire ID,Net ID,Layer,Width,Points\n';
    const wires = anyData.wires || [];
    wires.forEach((wire: any) => {
      const points = wire.points.map((p: any) => `(${p.x},${p.y})`).join(';');
      csvContent += `${wire.id},${wire.netId},${wire.layer},${wire.width},"${points}"\n`;
    });
  } else if (category === 'partitioning') {
    // Export partitions
    csvContent = 'Partition Index,Cell Count,Cell IDs\n';
    anyData.partitions.forEach((partition: string[], idx: number) => {
      csvContent += `${idx},${partition.length},"${partition.join(';')}"\n`;
    });
  } else if (category === 'drc_lvs') {
    // Export violations
    csvContent = 'Type,Severity,Message,Location X,Location Y\n';
    anyData.violations?.forEach((v: any) => {
      csvContent += `${v.type},${v.severity},"${v.message}",${v.location?.x || ''},${v.location?.y || ''}\n`;
    });
  } else if (category === 'reinforcement_learning') {
    // Export episode rewards
    csvContent = 'Episode,Reward\n';
    anyData.episodeRewards?.forEach((reward: number, idx: number) => {
      csvContent += `${idx},${reward}\n`;
    });
  } else {
    // Generic export
    return exportToCSV(result, filename);
  }

  const blob = new Blob([csvContent], { type: 'text/csv' });
  downloadBlob(blob, filename || `algorithm-result-detailed-${Date.now()}.csv`);
}

/**
 * Export visualization as PNG image
 */
export function exportCanvasToPNG(canvas: HTMLCanvasElement, filename?: string): void {
  canvas.toBlob((blob) => {
    if (blob) {
      downloadBlob(blob, filename || `visualization-${Date.now()}.png`);
    }
  });
}

/**
 * Export chart as PNG using Chart.js
 */
export function exportChartToPNG(chartRef: any, filename?: string): void {
  if (chartRef?.current) {
    const url = chartRef.current.toBase64Image();
    const link = document.createElement('a');
    link.download = filename || `chart-${Date.now()}.png`;
    link.href = url;
    link.click();
  }
}

/**
 * Export results as PDF (basic implementation)
 */
export function exportToPDF(result: AlgorithmResponse, filename?: string): void {
  const { category, algorithm, result: data, metadata } = result;

  // Create HTML content for PDF
  let htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Algorithm Results - ${algorithm}</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      margin: 40px;
      line-height: 1.6;
      color: #333;
    }
    h1 {
      color: #3f51b5;
      border-bottom: 3px solid #3f51b5;
      padding-bottom: 10px;
    }
    h2 {
      color: #1976d2;
      margin-top: 30px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 12px;
      text-align: left;
    }
    th {
      background-color: #3f51b5;
      color: white;
    }
    tr:nth-child(even) {
      background-color: #f5f5f5;
    }
    .metadata {
      background-color: #e3f2fd;
      padding: 15px;
      border-radius: 5px;
      margin: 20px 0;
    }
    .success {
      color: #4caf50;
      font-weight: bold;
    }
    .error {
      color: #f44336;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <h1>Algorithm Execution Results</h1>

  <div class="metadata">
    <p><strong>Category:</strong> ${category.replace('_', ' ').toUpperCase()}</p>
    <p><strong>Algorithm:</strong> ${algorithm.replace('_', ' ')}</p>
    <p><strong>Status:</strong> <span class="${data.success ? 'success' : 'error'}">${data.success ? 'SUCCESS' : 'FAILED'}</span></p>
    <p><strong>Timestamp:</strong> ${new Date(metadata.timestamp).toLocaleString()}</p>
    <p><strong>Runtime:</strong> ${metadata.runtime.toFixed(2)} ms</p>
    <p><strong>Version:</strong> ${metadata.version}</p>
  </div>

  <h2>Results</h2>
  <table>
    <thead>
      <tr>
        <th>Metric</th>
        <th>Value</th>
      </tr>
    </thead>
    <tbody>
`;

  // Add result metrics
  Object.entries(data).forEach(([key, value]) => {
    if (key === 'success') return; // Already shown

    let displayValue = value;
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        displayValue = `${value.length} items`;
      } else {
        displayValue = JSON.stringify(value, null, 2);
      }
    } else if (typeof value === 'number') {
      displayValue = value.toFixed(4);
    }

    htmlContent += `
      <tr>
        <td><strong>${key.replace(/([A-Z])/g, ' $1').trim()}</strong></td>
        <td>${displayValue}</td>
      </tr>
    `;
  });

  htmlContent += `
    </tbody>
  </table>

  <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px;">
    <p>Generated by AI Chip Design Platform • ${new Date().toLocaleString()}</p>
  </div>
</body>
</html>
  `;

  // Create blob and download
  const blob = new Blob([htmlContent], { type: 'text/html' });
  downloadBlob(blob, filename || `algorithm-result-${Date.now()}.html`);

  // Note: For true PDF generation, we'd need a library like jsPDF or pdfmake
  // This HTML can be opened in a browser and printed to PDF
  console.log('HTML report generated. Open in browser and print to PDF for full PDF export.');
}

/**
 * Helper function to trigger file download
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Copy results to clipboard as JSON
 */
export async function copyToClipboard(result: AlgorithmResponse): Promise<boolean> {
  try {
    const jsonString = JSON.stringify(result, null, 2);
    await navigator.clipboard.writeText(jsonString);
    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
}

/**
 * Export multiple results for comparison
 */
export function exportComparisonCSV(results: AlgorithmResponse[], filename?: string): void {
  let csvContent = 'Algorithm,';

  // Get all unique metric keys
  const allMetrics = new Set<string>();
  results.forEach(r => {
    Object.keys(r.result).forEach(key => {
      const value = (r.result as any)[key];
      if (typeof value !== 'object') {
        allMetrics.add(key);
      }
    });
  });

  // Header row
  csvContent += Array.from(allMetrics).join(',') + '\n';

  // Data rows
  results.forEach(r => {
    csvContent += `${r.algorithm},`;
    csvContent += Array.from(allMetrics).map(metric => {
      const value = (r.result as any)[metric];
      return typeof value === 'number' ? value.toFixed(4) : (value || '');
    }).join(',') + '\n';
  });

  const blob = new Blob([csvContent], { type: 'text/csv' });
  downloadBlob(blob, filename || `comparison-${Date.now()}.csv`);
}

/**
 * Export result summary for quick sharing
 */
export function exportSummaryText(result: AlgorithmResponse): void {
  const { category, algorithm, result: data, metadata } = result;

  let text = `Algorithm Results Summary\n`;
  text += `${'='.repeat(50)}\n\n`;
  text += `Category: ${category.replace('_', ' ').toUpperCase()}\n`;
  text += `Algorithm: ${algorithm.replace('_', ' ')}\n`;
  text += `Status: ${data.success ? '✓ SUCCESS' : '✗ FAILED'}\n`;
  text += `Runtime: ${metadata.runtime.toFixed(2)} ms\n`;
  text += `Timestamp: ${new Date(metadata.timestamp).toLocaleString()}\n\n`;

  text += `Key Metrics:\n`;
  text += `${'-'.repeat(50)}\n`;

  Object.entries(data).forEach(([key, value]) => {
    if (key === 'success' || typeof value === 'object') return;
    const displayKey = key.replace(/([A-Z])/g, ' $1').trim();
    const displayValue = typeof value === 'number' ? value.toFixed(4) : value;
    text += `${displayKey}: ${displayValue}\n`;
  });

  text += `\n${'='.repeat(50)}\n`;
  text += `Generated by AI Chip Design Platform\n`;

  const blob = new Blob([text], { type: 'text/plain' });
  downloadBlob(blob, `summary-${algorithm}-${Date.now()}.txt`);
}
