import fs from 'fs';
import path from 'path';

function walk(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walk(dirPath, callback) : callback(path.join(dir, f));
    });
}

let count = 0;
walk('./src', function(filePath) {
    if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) return;
    let content = fs.readFileSync(filePath, 'utf8');
    let newContent = content
        .replace(/direction="vertical"/g, 'orientation="vertical"')
        .replace(/direction="horizontal"/g, 'orientation="horizontal"')
        .replace(/bordered=\{false\}/g, 'variant="borderless"')
        .replace(/\btip="/g, 'description="');
    
    if (content !== newContent) {
        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log('Updated', filePath);
        count++;
    }
});
console.log('Total files updated:', count);
