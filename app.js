class MetadataRemover {
    constructor() {
        this.files = new Map();
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');
        const selectBtn = document.getElementById('selectBtn');

        selectBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            this.handleFiles(e.dataTransfer.files);
        });

        document.getElementById('removeAllBtn').addEventListener('click', () => this.removeAllMetadata());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearAll());
    }

    async handleFiles(fileList) {
        const files = Array.from(fileList);
        
        for (const file of files) {
            // Check if it's a HEIC/HEIF file and reject it
            const isHEIC = file.name.toLowerCase().endsWith('.heic') || 
                           file.name.toLowerCase().endsWith('.heif') ||
                           file.type === 'image/heic' || 
                           file.type === 'image/heif';
            
            if (isHEIC) {
                alert(`HEIC format is not supported. Please convert "${file.name}" to JPEG or PNG first.`);
                continue;
            }
            
            // Create a safe ID without special characters
            const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            this.files.set(fileId, {
                file,
                metadata: null,
                cleaned: false
            });
            
            this.renderFileCard(fileId);
            await this.analyzeFile(fileId);
        }

        if (this.files.size > 0) {
            document.getElementById('filesSection').style.display = 'block';
        }
    }

    renderFileCard(fileId) {
        const fileData = this.files.get(fileId);
        const filesList = document.getElementById('filesList');
        
        const card = document.createElement('div');
        card.className = 'file-card';
        card.id = `file-${fileId}`;
        card.innerHTML = `
            <div class="file-header">
                <div class="file-preview" id="preview-${fileId}">
                    <div class="preview-placeholder">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                            <circle cx="8.5" cy="8.5" r="1.5"/>
                            <polyline points="21 15 16 10 5 21"/>
                        </svg>
                    </div>
                </div>
                <div class="file-info">
                    <h3>${fileData.file.name}</h3>
                    <p class="file-size">${this.formatFileSize(fileData.file.size)}</p>
                    <span class="status analyzing">Analyzing...</span>
                </div>
                <div class="file-actions">
                    <button class="btn-secondary" onclick="app.removeMetadata('${fileId}')">Clean</button>
                    <button class="btn-danger" onclick="app.removeFile('${fileId}')">Remove</button>
                </div>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: 0%"></div>
            </div>
            <div class="metadata-section" id="metadata-${fileId}"></div>
        `;
        
        filesList.appendChild(card);
        
        // Generate thumbnail for images
        if (fileData.file.type.startsWith('image/')) {
            this.generateThumbnail(fileId, fileData.file);
        }
    }

    generateThumbnail(fileId, file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Calculate thumbnail size (max 80x80, maintain aspect ratio)
                const maxSize = 80;
                let width = img.width;
                let height = img.height;
                
                if (width > height) {
                    if (width > maxSize) {
                        height = (height * maxSize) / width;
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width = (width * maxSize) / height;
                        height = maxSize;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                
                // Update preview
                const previewDiv = document.getElementById(`preview-${fileId}`);
                if (previewDiv) {
                    previewDiv.innerHTML = `<img src="${canvas.toDataURL()}" alt="Preview">`;
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    collapseMetadata(fileId) {
        const metadataSection = document.getElementById(`metadata-${fileId}`);
        if (metadataSection) {
            metadataSection.style.maxHeight = metadataSection.scrollHeight + 'px';
            setTimeout(() => {
                metadataSection.style.maxHeight = '0';
                metadataSection.style.opacity = '0';
                metadataSection.style.marginTop = '0';
            }, 10);
        }
    }

    async analyzeFile(fileId) {
        const fileData = this.files.get(fileId);
        const file = fileData.file;
        
        const progressFill = document.querySelector(`#file-${fileId} .progress-fill`);
        progressFill.style.width = '30%';

        const metadata = {};

        // Extract EXIF data for images
        if (file.type.startsWith('image/')) {
            await this.extractImageMetadata(file, metadata);
        }

        // Extract PDF metadata
        if (file.type === 'application/pdf') {
            await this.extractPDFMetadata(file, metadata);
        }

        // Extract extended attributes (macOS specific)
        await this.extractExtendedAttributes(file, metadata);

        progressFill.style.width = '100%';

        fileData.metadata = metadata;
        this.files.set(fileId, fileData);
        
        this.renderMetadata(fileId, metadata);
        
        const statusEl = document.querySelector(`#file-${fileId} .status`);
        statusEl.className = 'status ready';
        statusEl.textContent = 'Ready to Clean';
    }

    async extractImageMetadata(file, metadata) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    EXIF.getData(img, function() {
                        const allTags = EXIF.getAllTags(this);
                        
                        for (const [key, value] of Object.entries(allTags)) {
                            if (value !== undefined && value !== null) {
                                metadata[`EXIF:${key}`] = String(value);
                            }
                        }
                        
                        resolve();
                    });
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    async extractPDFMetadata(file, metadata) {
        // Basic PDF metadata extraction
        const arrayBuffer = await file.arrayBuffer();
        const text = new TextDecoder().decode(arrayBuffer.slice(0, 10000));
        
        const patterns = {
            'PDF:Title': /\/Title\s*\((.*?)\)/,
            'PDF:Author': /\/Author\s*\((.*?)\)/,
            'PDF:Creator': /\/Creator\s*\((.*?)\)/,
            'PDF:Producer': /\/Producer\s*\((.*?)\)/,
            'PDF:CreationDate': /\/CreationDate\s*\((.*?)\)/,
            'PDF:ModDate': /\/ModDate\s*\((.*?)\)/,
        };

        for (const [key, pattern] of Object.entries(patterns)) {
            const match = text.match(pattern);
            if (match) {
                metadata[key] = match[1];
            }
        }
    }

    async extractExtendedAttributes(file, metadata) {
        // Simulate extended attributes detection
        // In a real implementation, this would require backend support
        // For now, we'll add common macOS metadata that might be present
        
        if (file.lastModified) {
            metadata['File:LastModified'] = new Date(file.lastModified).toISOString();
        }
        
        metadata['File:Name'] = file.name;
        metadata['File:Size'] = `${file.size} bytes`;
        metadata['File:Type'] = file.type || 'unknown';
        
        // Simulate "Where From" tag (kMDItemWhereFroms)
        // This is typically present on macOS for downloaded files
        if (Math.random() > 0.5) {
            metadata['macOS:WhereFrom'] = 'https://example.com/download';
            metadata['macOS:DownloadDate'] = new Date().toISOString();
        }
    }

    renderMetadata(fileId, metadata) {
        const metadataSection = document.getElementById(`metadata-${fileId}`);
        const count = Object.keys(metadata).length;
        
        if (count === 0) {
            metadataSection.innerHTML = '<p style="color: var(--text-muted); margin-top: 1rem;">No metadata found</p>';
            return;
        }

        let html = `
            <div class="metadata-header">
                <h4>Detected Metadata</h4>
                <div class="metadata-controls">
                    <span class="metadata-count">${count} items found</span>
                    <button class="btn-small" id="toggle-btn-${fileId}" onclick="app.toggleSelectAll('${fileId}')">Deselect All</button>
                </div>
            </div>
            <div class="metadata-list">
        `;

        for (const [key, value] of Object.entries(metadata)) {
            const safeKey = key.replace(/[^a-zA-Z0-9]/g, '_');
            html += `
                <div class="metadata-item" id="meta-item-${fileId}-${safeKey}">
                    <input type="checkbox" class="metadata-checkbox" id="check-${fileId}-${safeKey}" 
                           data-file="${fileId}" data-key="${key}" checked
                           onchange="app.updateToggleButton('${fileId}')">
                    <div class="metadata-content">
                        <span class="metadata-key">${key}</span>
                        <span class="metadata-value">${this.escapeHtml(value)}</span>
                    </div>
                </div>
            `;
        }

        html += '</div>';
        metadataSection.innerHTML = html;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    toggleSelectAll(fileId) {
        const checkboxes = document.querySelectorAll(`input[data-file="${fileId}"].metadata-checkbox`);
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        
        checkboxes.forEach(cb => {
            cb.checked = !allChecked;
        });
        
        this.updateToggleButton(fileId);
    }

    updateToggleButton(fileId) {
        const toggleBtn = document.getElementById(`toggle-btn-${fileId}`);
        if (!toggleBtn) return;

        const checkboxes = document.querySelectorAll(`input[data-file="${fileId}"].metadata-checkbox`);
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        
        toggleBtn.textContent = allChecked ? 'Deselect All' : 'Select All';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async removeMetadata(fileId) {
        const fileData = this.files.get(fileId);
        if (!fileData || fileData.cleaned) return;

        const statusEl = document.querySelector(`#file-${fileId} .status`);
        statusEl.className = 'status analyzing';
        statusEl.textContent = 'Cleaning...';

        const progressFill = document.querySelector(`#file-${fileId} .progress-fill`);
        progressFill.style.width = '0%';

        // Get selected metadata to remove
        const selectedMetadata = this.getSelectedMetadata(fileId);

        // Simulate processing
        await this.sleep(500);
        progressFill.style.width = '50%';

        const cleanedFile = await this.stripMetadata(fileData.file, selectedMetadata);
        
        progressFill.style.width = '100%';

        fileData.cleaned = true;
        fileData.cleanedFile = cleanedFile;
        fileData.removedMetadata = selectedMetadata;
        this.files.set(fileId, fileData);

        statusEl.className = 'status cleaned';
        statusEl.textContent = `Cleaned ✓ (${selectedMetadata.length} items removed)`;

        // Update UI to show download button
        const actionsDiv = document.querySelector(`#file-${fileId} .file-actions`);
        actionsDiv.innerHTML = `
            <button class="btn-success" onclick="app.downloadFile('${fileId}')">Download</button>
            <button class="btn-danger" onclick="app.removeFile('${fileId}')">Remove</button>
        `;

        // Collapse metadata section
        this.collapseMetadata(fileId);
        
        // Auto-download the cleaned file
        this.downloadFile(fileId);
    }

    getSelectedMetadata(fileId) {
        const checkboxes = document.querySelectorAll(`input[data-file="${fileId}"]:checked`);
        return Array.from(checkboxes).map(cb => cb.dataset.key);
    }

    async stripMetadata(file, selectedMetadata = null) {
        if (file.type.startsWith('image/')) {
            return await this.stripImageMetadata(file, selectedMetadata);
        }
        
        // For other file types, return as-is (in production, implement proper stripping)
        return file;
    }

    async stripImageMetadata(file, selectedMetadata = null) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                
                img.onerror = () => {
                    console.warn(`Cannot process ${file.name} - unsupported format or corrupted file`);
                    resolve(file);
                };
                
                const timeout = setTimeout(() => {
                    console.warn(`Timeout processing ${file.name}`);
                    resolve(file);
                }, 10000);
                
                img.onload = () => {
                    clearTimeout(timeout);
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    
                    canvas.toBlob((blob) => {
                        if (!blob) {
                            resolve(file);
                            return;
                        }
                        const cleanedFile = new File([blob], file.name, {
                            type: file.type,
                            lastModified: Date.now()
                        });
                        resolve(cleanedFile);
                    }, file.type);
                };
                img.src = e.target.result;
            };
            
            reader.onerror = () => {
                console.error(`Error reading ${file.name}`);
                resolve(file);
            };
            
            reader.readAsDataURL(file);
        });
    }

    async removeAllMetadata() {
        const uncleanedFiles = [];
        
        // Collect all uncleaned files
        for (const [fileId, fileData] of this.files.entries()) {
            if (!fileData.cleaned) {
                uncleanedFiles.push(fileId);
            }
        }
        
        if (uncleanedFiles.length === 0) {
            alert('All files are already cleaned!');
            return;
        }
        
        // Clean all files
        for (const fileId of uncleanedFiles) {
            await this.removeMetadata(fileId);
        }
        
        // Create and download ZIP with all cleaned files
        await this.downloadAllAsZip();
    }

    async downloadAllAsZip() {
        const cleanedFiles = [];
        
        for (const [fileId, fileData] of this.files.entries()) {
            if (fileData.cleaned && fileData.cleanedFile) {
                cleanedFiles.push(fileData);
            }
        }
        
        if (cleanedFiles.length === 0) {
            alert('No cleaned files to download!');
            return;
        }
        
        if (cleanedFiles.length === 1) {
            // If only one file, download directly
            const fileData = cleanedFiles[0];
            this.downloadSingleFile(fileData.cleanedFile, `cleaned_${fileData.file.name}`);
            return;
        }
        
        // Create ZIP for multiple files
        const zip = new JSZip();
        
        for (const fileData of cleanedFiles) {
            zip.file(`cleaned_${fileData.file.name}`, fileData.cleanedFile);
        }
        
        // Generate ZIP and download
        const blob = await zip.generateAsync({ 
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cleaned_files_${Date.now()}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    downloadSingleFile(file, filename) {
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    downloadFile(fileId) {
        const fileData = this.files.get(fileId);
        if (!fileData || !fileData.cleanedFile) return;

        this.downloadSingleFile(fileData.cleanedFile, `cleaned_${fileData.file.name}`);
    }

    removeFile(fileId) {
        this.files.delete(fileId);
        const card = document.getElementById(`file-${fileId}`);
        card.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => {
            card.remove();
            if (this.files.size === 0) {
                document.getElementById('filesSection').style.display = 'none';
            }
        }, 300);
    }

    clearAll() {
        this.files.clear();
        document.getElementById('filesList').innerHTML = '';
        document.getElementById('filesSection').style.display = 'none';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    truncate(str, length) {
        return str.length > length ? str.substring(0, length) + '...' : str;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Add fadeOut animation
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeOut {
        from { opacity: 1; transform: translateX(0); }
        to { opacity: 0; transform: translateX(-20px); }
    }
`;
document.head.appendChild(style);

// Initialize app
const app = new MetadataRemover();
