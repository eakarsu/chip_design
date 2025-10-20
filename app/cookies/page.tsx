import { Container, Box, Typography, Divider, Paper } from '@mui/material';

export default function CookiesPage() {
  return (
    <Container maxWidth="md" sx={{ py: { xs: 6, md: 10 } }}>
      <Typography variant="h3" sx={{ fontWeight: 700, mb: 2 }}>
        Cookie Policy
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        Last updated: October 19, 2024
      </Typography>

      <Divider sx={{ mb: 4 }} />

      <Box sx={{ '& h4': { fontWeight: 600, mt: 4, mb: 2 }, '& p': { mb: 2, color: 'text.secondary' } }}>
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
          What Are Cookies?
        </Typography>
        <Typography paragraph>
          Cookies are small text files that are placed on your device when you visit a website. They are
          widely used to make websites work more efficiently and provide information to website owners.
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          How We Use Cookies
        </Typography>
        <Typography paragraph>
          NeuralChip uses cookies and similar technologies to:
        </Typography>
        <Typography component="ul" sx={{ pl: 4, '& li': { mb: 1 } }}>
          <li>Keep you signed in to your account</li>
          <li>Understand how you use our Services</li>
          <li>Personalize content and features</li>
          <li>Improve performance and user experience</li>
          <li>Analyze usage patterns and trends</li>
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          Types of Cookies We Use
        </Typography>

        <Paper sx={{ p: 3, mb: 2, bgcolor: 'background.default' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Essential Cookies
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Required for the website to function properly. These cookies enable core functionality such as
            security, network management, and accessibility.
          </Typography>
        </Paper>

        <Paper sx={{ p: 3, mb: 2, bgcolor: 'background.default' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Analytics Cookies
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Help us understand how visitors interact with our website by collecting and reporting information
            anonymously. We use Google Analytics for this purpose.
          </Typography>
        </Paper>

        <Paper sx={{ p: 3, mb: 2, bgcolor: 'background.default' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Functional Cookies
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Enable enhanced functionality and personalization, such as remembering your preferences and settings.
          </Typography>
        </Paper>

        <Paper sx={{ p: 3, mb: 2, bgcolor: 'background.default' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Marketing Cookies
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Used to track visitors across websites to display relevant advertisements. We do not use
            third-party marketing cookies.
          </Typography>
        </Paper>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          Managing Cookies
        </Typography>
        <Typography paragraph>
          You can control and manage cookies in various ways:
        </Typography>
        <Typography component="ul" sx={{ pl: 4, '& li': { mb: 1 } }}>
          <li>
            <strong>Browser Settings:</strong> Most browsers allow you to refuse or accept cookies through
            your browser settings. Consult your browser's help documentation for more information.
          </li>
          <li>
            <strong>Opt-Out Tools:</strong> You can opt-out of analytics cookies by installing browser
            add-ons like Google Analytics Opt-out Browser Add-on.
          </li>
          <li>
            <strong>Cookie Preferences:</strong> Use our cookie preference center (available at the bottom
            of our website) to manage your cookie settings.
          </li>
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          Third-Party Cookies
        </Typography>
        <Typography paragraph>
          Some cookies are placed by third-party services that appear on our pages. We use the following
          third-party services:
        </Typography>
        <Typography component="ul" sx={{ pl: 4, '& li': { mb: 1 } }}>
          <li>Google Analytics - for website analytics</li>
          <li>Stripe - for payment processing</li>
          <li>Cloudflare - for content delivery and security</li>
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          Cookie Duration
        </Typography>
        <Typography paragraph>
          Cookies may be "session" cookies (deleted when you close your browser) or "persistent" cookies
          (remain on your device for a set period). We use both types of cookies for different purposes.
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          Changes to This Cookie Policy
        </Typography>
        <Typography paragraph>
          We may update this Cookie Policy from time to time. Any changes will be posted on this page with
          an updated revision date.
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          Contact Us
        </Typography>
        <Typography paragraph>
          If you have questions about our use of cookies, please contact us at:
        </Typography>
        <Typography paragraph>
          Email: privacy@neuralchip.ai
        </Typography>
      </Box>
    </Container>
  );
}
