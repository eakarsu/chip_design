import { Container, Box, Typography, Divider } from '@mui/material';

export default function PrivacyPage() {
  return (
    <Container maxWidth="md" sx={{ py: { xs: 6, md: 10 } }}>
      <Typography variant="h3" sx={{ fontWeight: 700, mb: 2 }}>
        Privacy Policy
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        Last updated: October 19, 2024
      </Typography>

      <Divider sx={{ mb: 4 }} />

      <Box sx={{ '& h4': { fontWeight: 600, mt: 4, mb: 2 }, '& p': { mb: 2, color: 'text.secondary' } }}>
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
          Introduction
        </Typography>
        <Typography paragraph>
          NeuralChip, Inc. ("we," "our," or "us") is committed to protecting your privacy. This Privacy
          Policy explains how we collect, use, disclose, and safeguard your information when you use our
          services, website, and products.
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          1. Information We Collect
        </Typography>
        <Typography paragraph>
          We collect information that you provide directly to us, including:
        </Typography>
        <Typography component="ul" sx={{ pl: 4, '& li': { mb: 1 } }}>
          <li>Account information (name, email, company)</li>
          <li>Payment and billing information</li>
          <li>Communications and support requests</li>
          <li>Usage data and analytics</li>
          <li>Technical information (IP address, browser type, device information)</li>
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          2. How We Use Your Information
        </Typography>
        <Typography paragraph>
          We use the information we collect to:
        </Typography>
        <Typography component="ul" sx={{ pl: 4, '& li': { mb: 1 } }}>
          <li>Provide, maintain, and improve our services</li>
          <li>Process transactions and send related information</li>
          <li>Send technical notices and support messages</li>
          <li>Respond to your comments and questions</li>
          <li>Monitor and analyze trends, usage, and activities</li>
          <li>Detect, prevent, and address technical issues</li>
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          3. Information Sharing and Disclosure
        </Typography>
        <Typography paragraph>
          We do not sell your personal information. We may share your information in the following circumstances:
        </Typography>
        <Typography component="ul" sx={{ pl: 4, '& li': { mb: 1 } }}>
          <li>With your consent</li>
          <li>With service providers who assist in our operations</li>
          <li>To comply with legal obligations</li>
          <li>To protect our rights and prevent fraud</li>
          <li>In connection with a merger, sale, or acquisition</li>
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          4. Data Security
        </Typography>
        <Typography paragraph>
          We implement appropriate technical and organizational measures to protect your personal information
          against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission
          over the Internet or electronic storage is 100% secure.
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          5. Your Rights and Choices
        </Typography>
        <Typography paragraph>
          You have the right to:
        </Typography>
        <Typography component="ul" sx={{ pl: 4, '& li': { mb: 1 } }}>
          <li>Access and receive a copy of your personal information</li>
          <li>Correct inaccurate or incomplete information</li>
          <li>Request deletion of your information</li>
          <li>Object to or restrict certain processing</li>
          <li>Opt-out of marketing communications</li>
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          6. Cookies and Tracking Technologies
        </Typography>
        <Typography paragraph>
          We use cookies and similar tracking technologies to collect information about your browsing activities.
          You can control cookies through your browser settings. See our Cookie Policy for more details.
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          7. International Data Transfers
        </Typography>
        <Typography paragraph>
          Your information may be transferred to and processed in countries other than your own. We ensure
          appropriate safeguards are in place to protect your information in accordance with this Privacy Policy.
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          8. Children's Privacy
        </Typography>
        <Typography paragraph>
          Our services are not directed to children under 13. We do not knowingly collect personal information
          from children under 13. If you become aware that a child has provided us with personal information,
          please contact us.
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          9. Changes to This Policy
        </Typography>
        <Typography paragraph>
          We may update this Privacy Policy from time to time. We will notify you of any changes by posting
          the new Privacy Policy on this page and updating the "Last updated" date.
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          10. Contact Us
        </Typography>
        <Typography paragraph>
          If you have questions about this Privacy Policy, please contact us at:
        </Typography>
        <Typography paragraph>
          Email: privacy@neuralchip.ai<br />
          Address: 123 Tech Street, San Francisco, CA 94105<br />
          Phone: +1 (555) 123-4567
        </Typography>
      </Box>
    </Container>
  );
}
