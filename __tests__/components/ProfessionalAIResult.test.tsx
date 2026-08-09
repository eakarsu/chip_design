import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import ProfessionalAIResult from '@/components/ai/ProfessionalAIResult';
import { lightTheme } from '@/theme';

function renderResult(result: unknown) {
  return render(<ThemeProvider theme={lightTheme}><ProfessionalAIResult title="Engineering review" result={result} /></ThemeProvider>);
}

describe('ProfessionalAIResult', () => {
  it('parses a fenced JSON provider response into professional sections', () => {
    const raw = '```json\n{"headline":"Timing evidence requires review","risk":"high","confidence":87,"metrics":[{"label":"WNS","value":"-0.08 ns"}],"actions":["Rerun the slow corner","Verify constraint parity"]}\n```';
    const { container } = renderResult(raw);

    expect(screen.getByText('Timing evidence requires review')).toBeInTheDocument();
    expect(screen.getByText('WNS')).toBeInTheDocument();
    expect(screen.getByText('-0.08 ns')).toBeInTheDocument();
    expect(screen.getByText('Rerun the slow corner')).toBeInTheDocument();
    expect(container.textContent).not.toContain('{"headline"');
  });

  it('renders nested findings and code without serializing objects', () => {
    const { container } = renderResult({
      summary: 'A verification artifact was generated for accountable review.',
      findings: [{ severity: 'moderate', finding: 'Reset behavior needs a directed test.', impact: 'A reset escape could remain undetected.' }],
      code: 'module counter(input logic clk);\nendmodule',
    });

    expect(screen.getByText('A verification artifact was generated for accountable review.')).toBeInTheDocument();
    expect(screen.getByText('Reset behavior needs a directed test.')).toBeInTheDocument();
    expect(screen.getByText(/module counter/)).toBeInTheDocument();
    expect(container.textContent).not.toContain('"severity"');
  });

  it('hides malformed provider serialization instead of exposing raw JSON', () => {
    const { container } = renderResult('OpenRouter analysis\n{"headline":"unfinished"');
    expect(screen.getByText(/incomplete structured response/i)).toBeInTheDocument();
    expect(container.textContent).not.toContain('{"headline"');
  });

  it('renders Markdown headings, tables, lists, and code as professional UI blocks', () => {
    const raw = `## Architecture decision\n\n| Metric | Value |\n|---|---|\n| WNS | +0.05 ns |\n\n- Verify the slow corner\n- Retain the timing report\n\n\`\`\`tcl\ncreate_clock -period 10 [get_ports clk]\n\`\`\``;
    const { container } = renderResult(raw);

    expect(screen.getByRole('heading', { name: 'Architecture decision' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('+0.05 ns')).toBeInTheDocument();
    expect(screen.getByText('Verify the slow corner')).toBeInTheDocument();
    expect(screen.getByText(/create_clock -period 10/)).toBeInTheDocument();
    expect(container.textContent).not.toContain('|---|');
    expect(container.textContent).not.toContain('```');
  });
});
