import { Container, Box, Typography, Divider, Paper } from '@mui/material';

export default function LicensesPage() {
  return (
    <Container maxWidth="md" sx={{ py: { xs: 6, md: 10 } }}>
      <Typography variant="h3" sx={{ fontWeight: 700, mb: 2 }}>
        Open Source Licenses
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        Third-party software used in NeuralChip products and services
      </Typography>

      <Divider sx={{ mb: 4 }} />

      <Box sx={{ '& h4': { fontWeight: 600, mt: 4, mb: 2 }, '& p': { mb: 2, color: 'text.secondary' } }}>
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
          Our Commitment to Open Source
        </Typography>
        <Typography paragraph>
          NeuralChip is built on the shoulders of giants. We use and contribute to numerous open source
          projects. This page acknowledges the open source software that makes our products possible.
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          Frontend Dependencies
        </Typography>

        <Paper sx={{ p: 3, mb: 2, bgcolor: 'background.default' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            React (MIT License)
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Copyright (c) Meta Platforms, Inc. and affiliates.
          </Typography>
          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
            https://github.com/facebook/react
          </Typography>
        </Paper>

        <Paper sx={{ p: 3, mb: 2, bgcolor: 'background.default' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Next.js (MIT License)
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Copyright (c) Vercel, Inc.
          </Typography>
          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
            https://github.com/vercel/next.js
          </Typography>
        </Paper>

        <Paper sx={{ p: 3, mb: 2, bgcolor: 'background.default' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Material-UI (MIT License)
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Copyright (c) Material-UI SAS
          </Typography>
          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
            https://github.com/mui/material-ui
          </Typography>
        </Paper>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          Backend & Runtime
        </Typography>

        <Paper sx={{ p: 3, mb: 2, bgcolor: 'background.default' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            PyTorch (BSD 3-Clause License)
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Copyright (c) PyTorch Contributors
          </Typography>
          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
            https://github.com/pytorch/pytorch
          </Typography>
        </Paper>

        <Paper sx={{ p: 3, mb: 2, bgcolor: 'background.default' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            TensorFlow (Apache License 2.0)
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Copyright (c) Google LLC
          </Typography>
          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
            https://github.com/tensorflow/tensorflow
          </Typography>
        </Paper>

        <Paper sx={{ p: 3, mb: 2, bgcolor: 'background.default' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Node.js (MIT License)
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Copyright Node.js contributors. All rights reserved.
          </Typography>
          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
            https://github.com/nodejs/node
          </Typography>
        </Paper>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          Development Tools
        </Typography>

        <Paper sx={{ p: 3, mb: 2, bgcolor: 'background.default' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            TypeScript (Apache License 2.0)
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Copyright (c) Microsoft Corporation
          </Typography>
          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
            https://github.com/microsoft/TypeScript
          </Typography>
        </Paper>

        <Paper sx={{ p: 3, mb: 2, bgcolor: 'background.default' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Jest (MIT License)
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Copyright (c) Meta Platforms, Inc. and affiliates.
          </Typography>
          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
            https://github.com/jestjs/jest
          </Typography>
        </Paper>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          License Texts
        </Typography>

        <Paper sx={{ p: 3, mb: 2, bgcolor: 'background.default' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            MIT License
          </Typography>
          <Typography variant="caption" sx={{ fontFamily: 'monospace', display: 'block', whiteSpace: 'pre-wrap' }}>
{`Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.`}
          </Typography>
        </Paper>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          Full License Information
        </Typography>
        <Typography paragraph>
          For a complete list of all dependencies and their licenses, please refer to:
        </Typography>
        <Typography component="ul" sx={{ pl: 4, '& li': { mb: 1 } }}>
          <li>Frontend: package.json in the root directory</li>
          <li>Python SDK: requirements.txt</li>
          <li>C++ SDK: CMakeLists.txt</li>
          <li>Go SDK: go.mod</li>
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
          Questions or Concerns?
        </Typography>
        <Typography paragraph>
          If you have questions about our use of open source software or believe we have made an error
          in attribution, please contact us at opensource@neuralchip.ai
        </Typography>
      </Box>
    </Container>
  );
}
