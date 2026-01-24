
import AdmZip from "adm-zip";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "uploads");

const files = fs.readdirSync(uploadsDir).filter(f => f.endsWith(".pptx"));

if (files.length === 0) {
    console.log("No PPTX files found in uploads/");
    process.exit(0);
}

files.forEach(file => {
    console.log(`\nInspecting: ${file}`);
    const filePath = path.join(uploadsDir, file);
    try {
        const zip = new AdmZip(filePath);
        const zipEntries = zip.getEntries();
        let found = false;
        zipEntries.forEach(entry => {
            if (entry.entryName.toLowerCase().includes("thumb")) {
                console.log(`  FOUND CANDIDATE: ${entry.entryName}`);
                found = true;
            }
        });
        if (!found) {
            console.log("  No thumbnail file found. Listing ALL entries:");
            zipEntries.forEach(e => console.log(`    - ${e.entryName}`));
        }
    } catch (e) {
        console.error(`  Error reading zip: ${e.message}`);
    }
});
