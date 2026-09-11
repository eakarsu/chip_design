import Link from 'next/link';
import { Button, Container, Stack, Typography } from '@mui/material';
import ProjectStarter from '@/components/journey/ProjectStarter';

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const { template } = await searchParams;
  return (
    <>
      <Container maxWidth="lg" sx={{ pt: { xs: 3, md: 6 } }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          gap={1}
        >
          <Typography variant="h6" fontWeight={750}>
            Design projects
          </Typography>
          <Button component={Link} href="/workspace/projects/new" variant="contained">
            New from specification
          </Button>
        </Stack>
      </Container>
      <ProjectStarter initialTemplate={template === 'fifo' || template === 'mac' ? template : 'gcd'} />
    </>
  );
}
