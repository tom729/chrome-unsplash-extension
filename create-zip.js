import { createServer } from 'http';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import JSZip from 'jszip';

async function createZip() {
  const zip = new JSZip();
  const distPath = './dist';

  try {
    const files = await readdir(distPath);
    for (const file of files) {
      const filePath = join(distPath, file);
      const content = await readFile(filePath);
      zip.file(file, content);
    }

    const zipContent = await zip.generateAsync({ type: 'nodebuffer' });
    return zipContent;
  } catch (error) {
    console.error(`Error creating ZIP: ${error}`);
    throw error;
  }
}

const server = createServer(async (req, res) => {
  try {
    const zipContent = await createZip();
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename=dist.zip'
    });
    res.end(zipContent);
  } catch (err) {
    console.error(`Error serving file: ${err}`);
    res.writeHead(500);
    res.end('Internal Server Error');
  }
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log('Access this URL to download the dist.zip file');
});