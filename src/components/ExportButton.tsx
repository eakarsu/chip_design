'use client';

import { useState } from 'react';
import {
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Snackbar,
  Alert,
} from '@mui/material';
import {
  FileDownload as DownloadIcon,
  Description as JsonIcon,
  TableChart as CsvIcon,
  PictureAsPdf as PdfIcon,
  ContentCopy as CopyIcon,
  Image as ImageIcon,
} from '@mui/icons-material';
import { AlgorithmResponse } from '@/types/algorithms';
import {
  exportToJSON,
  exportToCSV,
  exportToDetailedCSV,
  exportToPDF,
  exportSummaryText,
  copyToClipboard,
} from '@/lib/export';

interface ExportButtonProps {
  result: AlgorithmResponse;
  variant?: 'contained' | 'outlined' | 'text';
  size?: 'small' | 'medium' | 'large';
  showDetailedCSV?: boolean;
}

export default function ExportButton({
  result,
  variant = 'outlined',
  size = 'medium',
  showDetailedCSV = true,
}: ExportButtonProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const showMessage = (message: string, severity: 'success' | 'error' = 'success') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleExportJSON = () => {
    try {
      exportToJSON(result);
      showMessage('Exported as JSON successfully!');
    } catch (error) {
      showMessage('Failed to export JSON', 'error');
    }
    handleClose();
  };

  const handleExportCSV = () => {
    try {
      exportToCSV(result);
      showMessage('Exported as CSV successfully!');
    } catch (error) {
      showMessage('Failed to export CSV', 'error');
    }
    handleClose();
  };

  const handleExportDetailedCSV = () => {
    try {
      exportToDetailedCSV(result);
      showMessage('Exported detailed CSV successfully!');
    } catch (error) {
      showMessage('Failed to export detailed CSV', 'error');
    }
    handleClose();
  };

  const handleExportPDF = () => {
    try {
      exportToPDF(result);
      showMessage('Exported as HTML (print to PDF in browser)!');
    } catch (error) {
      showMessage('Failed to export PDF', 'error');
    }
    handleClose();
  };

  const handleExportSummary = () => {
    try {
      exportSummaryText(result);
      showMessage('Exported summary as text!');
    } catch (error) {
      showMessage('Failed to export summary', 'error');
    }
    handleClose();
  };

  const handleCopyToClipboard = async () => {
    try {
      const success = await copyToClipboard(result);
      if (success) {
        showMessage('Copied to clipboard!');
      } else {
        showMessage('Failed to copy to clipboard', 'error');
      }
    } catch (error) {
      showMessage('Failed to copy to clipboard', 'error');
    }
    handleClose();
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        startIcon={<DownloadIcon />}
        onClick={handleClick}
        aria-controls={open ? 'export-menu' : undefined}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : undefined}
      >
        Export
      </Button>

      <Menu
        id="export-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        MenuListProps={{
          'aria-labelledby': 'export-button',
        }}
      >
        <MenuItem onClick={handleExportJSON}>
          <ListItemIcon>
            <JsonIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Export as JSON</ListItemText>
        </MenuItem>

        <MenuItem onClick={handleExportCSV}>
          <ListItemIcon>
            <CsvIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Export as CSV (Summary)</ListItemText>
        </MenuItem>

        {showDetailedCSV && (
          <MenuItem onClick={handleExportDetailedCSV}>
            <ListItemIcon>
              <CsvIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Export as CSV (Detailed)</ListItemText>
          </MenuItem>
        )}

        <MenuItem onClick={handleExportPDF}>
          <ListItemIcon>
            <PdfIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Export as HTML/PDF</ListItemText>
        </MenuItem>

        <MenuItem onClick={handleExportSummary}>
          <ListItemIcon>
            <ImageIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Export Summary (TXT)</ListItemText>
        </MenuItem>

        <MenuItem onClick={handleCopyToClipboard}>
          <ListItemIcon>
            <CopyIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Copy to Clipboard</ListItemText>
        </MenuItem>
      </Menu>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}
