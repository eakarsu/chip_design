import { Container, Box, Typography, Divider } from '@mui/material';

export default function TermsPage() {
  return (
    <Container maxWidth="md" sx={{ py: { xs: 6, md: 10 } }}>
      <Typography variant="h3" sx={{ fontWeight: 700, mb: 2 }}>
        Terms of Service
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        Last updated: October 19, 2024
      </Typography>

      <Divider sx={{ mb: 4 }} />

      <Box sx={{ '& h4': { fontWeight: 600, mt: 4, mb: 2 }, '& p': { mb: 2, color: 'text.secondary' } }}>
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
          Agreement to Terms
        </Typography>
        <Typography paragraph>
          By accessing or using NeuralChip's services, website, or products ("Services"), you agree to be bound
          by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use our Services.
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          1. Use of Services
        </Typography>
        <Typography paragraph>
          You may use our Services only in compliance with these Terms and all applicable laws and regulations.
          You agree not to:
        </Typography>
        <Typography component="ul" sx={{ pl: 4, '& li': { mb: 1 } }}>
          <li>Use the Services for any illegal or unauthorized purpose</li>
          <li>Attempt to gain unauthorized access to our systems</li>
          <li>Interfere with or disrupt the Services</li>
          <li>Violate any intellectual property rights</li>
          <li>Transmit any harmful code or malware</li>
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          2. Account Registration
        </Typography>
        <Typography paragraph>
          To access certain features, you must register for an account. You agree to:
        </Typography>
        <Typography component="ul" sx={{ pl: 4, '& li': { mb: 1 } }}>
          <li>Provide accurate and complete information</li>
          <li>Maintain the security of your account credentials</li>
          <li>Notify us immediately of any unauthorized use</li>
          <li>Be responsible for all activities under your account</li>
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          3. Intellectual Property Rights
        </Typography>
        <Typography paragraph>
          The Services, including all content, features, and functionality, are owned by NeuralChip and
          protected by copyright, trademark, and other intellectual property laws. You may not copy, modify,
          distribute, or create derivative works without our express written permission.
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          4. User Content
        </Typography>
        <Typography paragraph>
          You retain all rights to any content you submit, post, or display on or through the Services ("User Content").
          By submitting User Content, you grant us a worldwide, non-exclusive, royalty-free license to use,
          reproduce, and display such content in connection with providing the Services.
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          5. Payment Terms
        </Typography>
        <Typography paragraph>
          Certain Services require payment. You agree to:
        </Typography>
        <Typography component="ul" sx={{ pl: 4, '& li': { mb: 1 } }}>
          <li>Provide current, complete, and accurate billing information</li>
          <li>Pay all fees and charges on time</li>
          <li>Accept responsibility for all charges under your account</li>
          <li>Notify us of any billing discrepancies within 30 days</li>
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          6. Service Level Agreement (SLA)
        </Typography>
        <Typography paragraph>
          We strive to maintain 99.9% uptime for our Services. If we fail to meet this SLA, you may be
          eligible for service credits as detailed in your service agreement. Scheduled maintenance and
          force majeure events are excluded from SLA calculations.
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          7. Disclaimer of Warranties
        </Typography>
        <Typography paragraph>
          THE SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER
          EXPRESS OR IMPLIED. WE DISCLAIM ALL WARRANTIES, INCLUDING MERCHANTABILITY, FITNESS FOR A
          PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          8. Limitation of Liability
        </Typography>
        <Typography paragraph>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, NEURALCHIP SHALL NOT BE LIABLE FOR ANY INDIRECT,
          INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES,
          WHETHER INCURRED DIRECTLY OR INDIRECTLY.
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          9. Indemnification
        </Typography>
        <Typography paragraph>
          You agree to indemnify and hold harmless NeuralChip from any claims, damages, losses, liabilities,
          and expenses arising from your use of the Services or violation of these Terms.
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          10. Termination
        </Typography>
        <Typography paragraph>
          We may suspend or terminate your access to the Services at any time, with or without cause or notice.
          Upon termination, your right to use the Services will immediately cease.
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          11. Governing Law
        </Typography>
        <Typography paragraph>
          These Terms are governed by the laws of the State of California, without regard to conflict of law
          principles. Any disputes shall be resolved in the state or federal courts located in San Francisco, California.
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          12. Changes to Terms
        </Typography>
        <Typography paragraph>
          We reserve the right to modify these Terms at any time. We will notify you of material changes
          by posting the new Terms on this page. Your continued use of the Services after such changes
          constitutes acceptance of the new Terms.
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          13. Contact Information
        </Typography>
        <Typography paragraph>
          For questions about these Terms, contact us at:
        </Typography>
        <Typography paragraph>
          Email: legal@neuralchip.ai<br />
          Address: 123 Tech Street, San Francisco, CA 94105
        </Typography>
      </Box>
    </Container>
  );
}
