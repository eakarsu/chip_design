'use client';

import { Container, Box, Typography, Grid, TextField, Button, Card, CardContent } from '@mui/material';
import Hero from '@/components/Hero';
import { useState } from 'react';

const contactInfo = [
  {
    icon: 'mail',
    title: 'Email',
    value: 'hello@neuralchip.ai',
    link: 'mailto:hello@neuralchip.ai',
  },
  {
    icon: 'phone',
    title: 'Phone',
    value: '+1 (555) 123-4567',
    link: 'tel:+15551234567',
  },
  {
    icon: 'location_on',
    title: 'Office',
    value: '123 AI Avenue, San Francisco, CA 94102',
    link: 'https://maps.google.com',
  },
];

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    message: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Form submitted:', formData);
    // Handle form submission
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <>
      <Hero
        title="Get in Touch"
        subtitle="We'd love to hear from you. Contact our team for sales inquiries, technical support, or partnerships."
        backgroundGradient={false}
      />

      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        <Grid container spacing={6}>
          {/* Contact Form */}
          <Grid item xs={12} md={7}>
            <Box component="form" onSubmit={handleSubmit}>
              <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
                Send us a message
              </Typography>
              <Grid container spacing={3}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    required
                    label="Name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    required
                    type="email"
                    label="Email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Company"
                    name="company"
                    value={formData.company}
                    onChange={handleChange}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    required
                    multiline
                    rows={6}
                    label="Message"
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                  />
                </Grid>
                <Grid item xs={12}>
                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    sx={{ px: 4 }}
                    endIcon={
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                        send
                      </span>
                    }
                  >
                    Send Message
                  </Button>
                </Grid>
              </Grid>
            </Box>
          </Grid>

          {/* Contact Info */}
          <Grid item xs={12} md={5}>
            <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
              Contact Information
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {contactInfo.map((info, index) => (
                <Card key={index} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
                  <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 48,
                        height: 48,
                        borderRadius: 2,
                        bgcolor: 'primary.main',
                        color: 'primary.contrastText',
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 24 }}>
                        {info.icon}
                      </span>
                    </Box>
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
                        {info.title}
                      </Typography>
                      <Typography
                        variant="body1"
                        sx={{ fontWeight: 500 }}
                        component="a"
                        href={info.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        color="inherit"
                      >
                        {info.value}
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>

            <Box sx={{ mt: 4, p: 3, bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Business Hours
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Monday - Friday: 9:00 AM - 6:00 PM PST
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Saturday - Sunday: Closed
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Container>
    </>
  );
}
