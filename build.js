import { execSync } from 'child_process';
import { existsSync, rmSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const clientDir = join(__dirname, 'client');
const serverDir = join(__dirname, 'server');
const clientDistDir = join(clientDir, 'dist');
const serverPublicDir = join(serverDir, 'public');

console.log('🚀 Starting build process...\n');

// Step 1: Install client dependencies if needed
console.log('📦 Checking client dependencies...');
if (!existsSync(join(clientDir, 'node_modules'))) {
  console.log('   Installing client dependencies...');
  execSync('npm install', { cwd: clientDir, stdio: 'inherit' });
}

// Step 2: Build the client
console.log('\n🔨 Building client...');
execSync('npm run build', { cwd: clientDir, stdio: 'inherit' });

// Step 3: Clean up old public folder in server
if (existsSync(serverPublicDir)) {
  console.log('\n🧹 Cleaning old public folder...');
  rmSync(serverPublicDir, { recursive: true });
}

// Step 4: Copy dist to server/public
console.log('\n📁 Copying build files to server/public...');
cpSync(clientDistDir, serverPublicDir, { recursive: true });

console.log('\n✅ Build complete!');
console.log('   Client files are now in server/public/');
console.log('   You can now deploy the server folder to Render.\n');
console.log('📋 To start the production server:');
console.log('   cd server && npm start\n');
