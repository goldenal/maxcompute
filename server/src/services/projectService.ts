import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

interface AssetEntry {
    id: string;
    name: string;
    filename: string;
}

class ProjectService {
    async validateProject(projectPath: string): Promise<boolean> {
        console.log(`[ProjectService] validateProject: ${projectPath}`);
        try {
            const pubspecPath = path.join(projectPath, 'pubspec.yaml');
            await fs.promises.access(pubspecPath);
            console.log(`[ProjectService] Project valid: ${projectPath}`);
            return true;
        } catch (error) {
            console.warn(`[ProjectService] Project invalid (no pubspec.yaml): ${projectPath}`);
            return false;
        }
    }

    async createProject(parentPath: string, projectName: string): Promise<string> {
        try {
            // Ensure parent directory exists
            await fs.promises.access(parentPath);

            const fullPath = path.join(parentPath, projectName);

            // Check if already exists
            try {
                await fs.promises.access(fullPath);
                throw new Error(`Directory ${projectName} already exists in ${parentPath}`);
            } catch (e) {
                const err = e as NodeJS.ErrnoException;
                if (err.code !== 'ENOENT') throw err;
            }

            // Run flutter create
            await execPromise(`flutter create ${projectName}`, { cwd: parentPath });

            // Create features directory structure
            const featuresPath = path.join(fullPath, 'lib', 'features');
            await fs.promises.mkdir(featuresPath, { recursive: true });

            // Create assets/images directory
            const assetsDir = path.join(fullPath, 'assets', 'images');
            await fs.promises.mkdir(assetsDir, { recursive: true });

            // Update pubspec.yaml to include assets
            await this.updatePubspec(fullPath);

            return fullPath;
        } catch (error) {
            console.error('Create Project Error:', error);
            throw error;
        }
    }

    async getFeatures(projectPath: string): Promise<string[]> {
        try {
            const featuresPath = path.join(projectPath, 'lib', 'features');

            // If features dir doesn't exist, create it
            try {
                await fs.promises.access(featuresPath);
            } catch (e) {
                await fs.promises.mkdir(featuresPath, { recursive: true });
                return [];
            }

            const entries = await fs.promises.readdir(featuresPath, { withFileTypes: true });
            return entries
                .filter((dirent) => dirent.isDirectory())
                .map((dirent) => dirent.name);
        } catch (error) {
            console.error('Get Features Error:', error);
            throw error;
        }
    }

    async createFeature(projectPath: string, featureName: string): Promise<string> {
        try {
            const featurePath = path.join(projectPath, 'lib', 'features', featureName);
            await fs.promises.mkdir(featurePath, { recursive: true });
            return featureName;
        } catch (error) {
            console.error('Create Feature Error:', error);
            throw error;
        }
    }

    async saveFile(projectPath: string, featureName: string, fileName: string, content: string): Promise<string> {
        try {
            const featurePath = path.join(projectPath, 'lib', 'features', featureName);

            // Ensure feature exists
            await fs.promises.mkdir(featurePath, { recursive: true });

            const filePath = path.join(featurePath, fileName);
            await fs.promises.writeFile(filePath, content, 'utf8');

            console.log(`[ProjectService] File saved: ${filePath}`);
            return filePath;
        } catch (error) {
            console.error('Save File Error:', error);
            throw error;
        }
    }

    /**
     * Saves uploaded image to temp directory
     * Returns unique filename
     */
    async saveTempUpload(name: string, data: string): Promise<string> {
        try {
            const uploadsDir = path.join(__dirname, '../../uploads');
            await fs.promises.mkdir(uploadsDir, { recursive: true });

            // Generate unique filename to avoid collisions
            const timestamp = Date.now();
            const randomSuffix = Math.random().toString(36).substring(2, 8);
            const safeName = name.replace(/[^a-zA-Z0-9-_]/g, '_');
            const filename = `${safeName}_${timestamp}_${randomSuffix}.png`;
            const filePath = path.join(uploadsDir, filename);

            const buffer = Buffer.from(data, 'base64');
            await fs.promises.writeFile(filePath, buffer);

            console.log(`[ProjectService] Temp upload saved: ${filename}`);
            return filename;
        } catch (error) {
            console.error('Save Temp Upload Error:', error);
            throw error;
        }
    }

    /**
     * Copies assets from temp uploads to project's assets/images folder
     * Returns assetMap: { nodeId: 'assets/images/filename.png' }
     */
    async saveAssets(projectPath: string, assets: Record<string, AssetEntry>): Promise<Record<string, string>> {
        try {
            const assetsDir = path.join(projectPath, 'assets', 'images');
            await fs.promises.mkdir(assetsDir, { recursive: true });
            const uploadsDir = path.join(__dirname, '../../uploads');

            const assetMap: Record<string, string> = {};

            for (const [nodeId, asset] of Object.entries(assets)) {
                // Asset structure: { id, name, filename }
                // filename is the temp file in /uploads directory

                if (!asset.filename) {
                    console.warn(`[ProjectService] Asset ${nodeId} missing filename, skipping`);
                    continue;
                }

                // Use the original name but sanitize it
                const safeName = asset.name.replace(/[^a-zA-Z0-9-_]/g, '_');

                // Keep it unique by using part of the temp filename's suffix
                const tempParts = asset.filename.split('_');
                const uniqueSuffix = tempParts.length > 1 ? `_${tempParts[tempParts.length - 1].replace('.png', '')}` : '';

                const destFileName = `${safeName}${uniqueSuffix}.png`;
                const destPath = path.join(assetsDir, destFileName);

                // Copy from temp uploads to project assets
                const srcPath = path.join(uploadsDir, asset.filename);

                try {
                    await fs.promises.copyFile(srcPath, destPath);
                    console.log(`[ProjectService] Asset copied: ${asset.filename} -> ${destFileName}`);

                    // Map nodeId to Flutter asset path
                    assetMap[nodeId] = `assets/images/${destFileName}`;

                    // Optional: Delete temp file after successful copy
                    try {
                        await fs.promises.unlink(srcPath);
                    } catch (e) {
                        // Ignore deletion errors
                    }
                } catch (e) {
                    const err = e as Error;
                    console.error(`[ProjectService] Failed to copy asset ${asset.filename}:`, err.message);
                    // Continue with other assets even if one fails
                }
            }

            console.log('[ProjectService] Asset map created:', assetMap);
            return assetMap;
        } catch (error) {
            console.error('Save Assets Error:', error);
            throw error;
        }
    }

    /**
     * Updates pubspec.yaml to register assets/images/ folder
     */
    async updatePubspec(projectPath: string): Promise<void> {
        try {
            const pubspecPath = path.join(projectPath, 'pubspec.yaml');
            let content = await fs.promises.readFile(pubspecPath, 'utf8');

            // Check if assets/images/ is already registered
            if (content.includes('assets/images/')) {
                console.log('[ProjectService] pubspec.yaml already includes assets/images/');
                return;
            }

            const lines = content.split('\n');
            const flutterIndex = lines.findIndex((line) => line.trim() === 'flutter:');

            if (flutterIndex === -1) {
                // No flutter section, add it at the end
                lines.push('');
                lines.push('flutter:');
                lines.push('  assets:');
                lines.push('    - assets/images/');
            } else {
                // Find if assets section exists
                const assetsIndex = lines.findIndex((line, idx) =>
                    idx > flutterIndex && line.trim().startsWith('assets:')
                );

                if (assetsIndex === -1) {
                    // No assets section, add it after flutter:
                    lines.splice(flutterIndex + 1, 0, '  assets:', '    - assets/images/');
                } else {
                    // Assets section exists, add our path
                    // Find the indentation of the assets section
                    const assetsLine = lines[assetsIndex];
                    const indent = (assetsLine.match(/^\s*/) || [''])[0] + '  ';
                    lines.splice(assetsIndex + 1, 0, `${indent}- assets/images/`);
                }
            }

            content = lines.join('\n');
            await fs.promises.writeFile(pubspecPath, content, 'utf8');
            console.log('[ProjectService] pubspec.yaml updated with assets/images/');
        } catch (error) {
            console.error('Update Pubspec Error:', error);
            // Don't fail the whole process if pubspec update fails
        }
    }

    /**
     * Cleanup old temp uploads (optional maintenance method)
     */
    async cleanupTempUploads(maxAgeHours: number = 24): Promise<void> {
        try {
            const uploadsDir = path.join(__dirname, '../../uploads');
            const files = await fs.promises.readdir(uploadsDir);
            const now = Date.now();
            const maxAge = maxAgeHours * 60 * 60 * 1000;

            for (const file of files) {
                const filePath = path.join(uploadsDir, file);
                const stats = await fs.promises.stat(filePath);

                if (now - stats.mtimeMs > maxAge) {
                    await fs.promises.unlink(filePath);
                    console.log(`[ProjectService] Cleaned up old temp file: ${file}`);
                }
            }
        } catch (error) {
            console.error('Cleanup Temp Uploads Error:', error);
        }
    }
}

export default ProjectService;
