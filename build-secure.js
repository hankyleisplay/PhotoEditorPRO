const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const JavaScriptObfuscator = require('javascript-obfuscator');

const filesToObfuscate = ['main.js', 'preload.js', 'app.js'];
const backups = {};

console.log("==========================================");
console.log(">> Photo Editor PRO - Secure Build Pipeline");
console.log("==========================================");

try {
    // 1. Back up original files
    for (const file of filesToObfuscate) {
        const filePath = path.join(__dirname, file);
        if (fs.existsSync(filePath)) {
            console.log(`[Backup] Copying clean source: ${file}...`);
            backups[file] = fs.readFileSync(filePath, 'utf8');
        }
    }

    // 2. Obfuscate files in place
    for (const file of filesToObfuscate) {
        const filePath = path.join(__dirname, file);
        if (backups[file]) {
            console.log(`[Obfuscation] Obfuscating ${file} with high protection...`);
            
            const obfuscated = JavaScriptObfuscator.obfuscate(backups[file], {
                compact: true,
                controlFlowFlattening: true,
                controlFlowFlatteningThreshold: 0.8,
                deadCodeInjection: true,
                deadCodeInjectionThreshold: 0.4,
                debugProtection: true,
                debugProtectionInterval: 1500,
                disableConsoleOutput: true,
                identifierNamesGenerator: 'hexadecimal',
                log: false,
                renameGlobals: false, // Prevent module export failures
                selfDefending: true,
                splitStrings: true,
                splitStringsChunkLength: 6,
                stringArray: true,
                stringArrayCallsTransform: true,
                stringArrayEncoding: ['rc4'],
                stringArrayThreshold: 0.85
            });
            
            fs.writeFileSync(filePath, obfuscated.getObfuscatedCode(), 'utf8');
        }
    }

    // 3. Trigger electron-builder
    console.log("[Build] Packaging application (Portable + NSIS Installer)...");
    execSync('npm run dist', { stdio: 'inherit' });
    console.log("[Build] electron-builder completed successfully.");

} catch (err) {
    console.error("❌ Critical error during secure build pipeline:", err);
} finally {
    // 4. Restore original source code files so developer has clean code
    console.log("------------------------------------------");
    for (const file of filesToObfuscate) {
        if (backups[file]) {
            console.log(`[Restore] Restoring clean source: ${file}...`);
            fs.writeFileSync(path.join(__dirname, file), backups[file], 'utf8');
        }
    }
    console.log(">> Secure Build Pipeline complete. Sources restored.");
    console.log("==========================================");
}
