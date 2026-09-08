document.addEventListener('DOMContentLoaded', function() {

    // HEADER SCROLL EFFECT
    const header = document.getElementById('header');
    const scrollTop = document.getElementById('scrollTop');

    window.addEventListener('scroll', function() {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }

        if (window.scrollY > 400) {
            scrollTop.classList.add('visible');
        } else {
            scrollTop.classList.remove('visible');
        }
    });

    // SCROLL TO TOP
    if (scrollTop) {
        scrollTop.addEventListener('click', function() {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // MOBILE MENU
    const mobileToggle = document.getElementById('mobileToggle');
    const mobileMenu = document.getElementById('mobileMenu');

    if (mobileToggle && mobileMenu) {
        mobileToggle.addEventListener('click', function() {
            mobileMenu.classList.toggle('open');
            const icon = mobileToggle.querySelector('.material-symbols-rounded');
            if (mobileMenu.classList.contains('open')) {
                icon.textContent = 'close';
            } else {
                icon.textContent = 'menu';
            }
        });

        // Close mobile menu when clicking a link
        mobileMenu.querySelectorAll('a').forEach(function(link) {
            link.addEventListener('click', function() {
                mobileMenu.classList.remove('open');
                mobileToggle.querySelector('.material-symbols-rounded').textContent = 'menu';
            });
        });
    }

    // FAQ ACCORDION
    document.querySelectorAll('.faq-question').forEach(function(question) {
        question.addEventListener('click', function() {
            const item = this.parentElement;
            const answer = item.querySelector('.faq-answer');
            const isActive = item.classList.contains('active');

            // Close all other FAQ items
            document.querySelectorAll('.faq-item').forEach(function(otherItem) {
                otherItem.classList.remove('active');
                otherItem.querySelector('.faq-answer').style.maxHeight = '0';
            });

            if (!isActive) {
                item.classList.add('active');
                answer.style.maxHeight = answer.scrollHeight + 'px';
            }
        });
    });

    // FILE UPLOAD ZONE
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');

    if (uploadZone && fileInput) {
        uploadZone.addEventListener('dragover', function(e) {
            e.preventDefault();
            uploadZone.classList.add('dragover');
        });

        uploadZone.addEventListener('dragleave', function(e) {
            e.preventDefault();
            uploadZone.classList.remove('dragover');
        });

        uploadZone.addEventListener('drop', function(e) {
            e.preventDefault();
            uploadZone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleFileUpload(files);
            }
        });

        fileInput.addEventListener('change', function() {
            if (this.files.length > 0) {
                handleFileUpload(this.files);
            }
        });
    }

    function handleFileUpload(files) {
        const file = files[0];
        const maxSize = 100 * 1024 * 1024; // 100MB

        if (file.size > maxSize) {
            showNotification('File too large. Maximum size is 100 MB.', 'error');
            return;
        }

        const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/rtf', 'application/epub+zip'];
        
        showNotification('File "' + file.name + '" uploaded successfully! Redirecting to tools...', 'success');

        // Simulate redirect after upload
        setTimeout(function() {
            const ext = file.name.split('.').pop().toLowerCase();
            if (['doc', 'docx'].includes(ext)) {
                window.location.href = 'pdf-converter.html#word-to-pdf';
            } else if (['jpg', 'jpeg', 'png'].includes(ext)) {
                window.location.href = 'pdf-converter.html#jpg-to-pdf';
            } else if (ext === 'pdf') {
                window.location.href = 'pdf-editor.html';
            } else if (['xls', 'xlsx'].includes(ext)) {
                window.location.href = 'pdf-converter.html#excel-to-pdf';
            } else if (['pptx', 'ppt'].includes(ext)) {
                window.location.href = 'pdf-converter.html#pptx-to-pdf';
            } else {
                window.location.href = 'pdf-converter.html';
            }
        }, 1500);
    }

    // NOTIFICATION SYSTEM
    function showNotification(message, type) {
        const notification = document.getElementById('notification');
        const notificationText = document.getElementById('notificationText');
        if (!notification || !notificationText) return;

        notificationText.textContent = message;
        notification.className = 'notification ' + type;
        notification.classList.add('show');

        setTimeout(function() {
            notification.classList.remove('show');
        }, 4000);
    }

    // Make showNotification available globally
    window.showNotification = showNotification;

    // SCROLL ANIMATIONS
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, observerOptions);

    document.querySelectorAll('.animate-in').forEach(function(el) {
        observer.observe(el);
    });

    // SMOOTH SCROLL FOR ANCHOR LINKS
    document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
        anchor.addEventListener('click', function(e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            const target = document.querySelector(targetId);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    // TOOL PAGE UPLOAD ZONE
    const toolUploadZone = document.getElementById('toolUploadZone');
    const toolFileInput = document.getElementById('toolFileInput');

    if (toolUploadZone && toolFileInput) {
        toolUploadZone.addEventListener('click', function() {
            toolFileInput.click();
        });

        toolUploadZone.addEventListener('dragover', function(e) {
            e.preventDefault();
            toolUploadZone.classList.add('dragover');
        });

        toolUploadZone.addEventListener('dragleave', function(e) {
            e.preventDefault();
            toolUploadZone.classList.remove('dragover');
        });

        toolUploadZone.addEventListener('drop', function(e) {
            e.preventDefault();
            toolUploadZone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleToolFileUpload(files[0]);
            }
        });

        toolFileInput.addEventListener('change', function() {
            if (this.files.length > 0) {
                handleToolFileUpload(this.files[0]);
            }
        });
    }

    function handleToolFileUpload(file) {
        const maxSize = 100 * 1024 * 1024;
        if (file.size > maxSize) {
            showNotification('File too large. Maximum size is 100 MB.', 'error');
            return;
        }

        const fileName = document.getElementById('uploadedFileName');
        const uploadZone = document.getElementById('toolUploadZone');
        const processingArea = document.getElementById('processingArea');
        const toolProcessing = document.getElementById('toolProcessing');

        if (fileName) {
            fileName.style.display = 'flex';
            const nameText = fileName.querySelector('#uploadedFileNameText') || fileName;
            if (nameText !== fileName) nameText.textContent = file.name;
            else nameText.textContent = file.name;
        }
        if (uploadZone) uploadZone.style.display = 'none';
        if (toolProcessing) {
            toolProcessing.style.display = 'flex';
        }
        if (processingArea) {
            processingArea.style.display = 'block';
            
            // Simulate processing
            setTimeout(function() {
                if (toolProcessing) {
                    toolProcessing.innerHTML = '<div style="text-align:center;padding:40px"><span class="material-symbols-rounded" style="font-size:48px;color:var(--success);margin-bottom:16px;display:block">check_circle</span><h3 style="font-size:1.2rem;margin-bottom:8px">Processing Complete!</h3><p style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:24px">Your file has been processed successfully.</p><button class="btn btn-primary" onclick="showNotification(\'Download started!\', \'success\')"><span class="material-symbols-rounded">download</span> Download File</button></div>';
                }
                processingArea.innerHTML = '<div style="text-align:center;padding:40px"><span class="material-symbols-rounded" style="font-size:48px;color:var(--success);margin-bottom:16px;display:block">check_circle</span><h3 style="font-size:1.2rem;margin-bottom:8px">Processing Complete!</h3><p style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:24px">Your file has been processed successfully.</p><button class="btn btn-primary" onclick="showNotification(\'Download started!\', \'success\')"><span class="material-symbols-rounded">download</span> Download File</button></div>';
            }, 3000);
        } else if (toolProcessing) {
            setTimeout(function() {
                toolProcessing.innerHTML = '<div style="text-align:center;padding:40px"><span class="material-symbols-rounded" style="font-size:48px;color:var(--success);margin-bottom:16px;display:block">check_circle</span><h3 style="font-size:1.2rem;margin-bottom:8px">Processing Complete!</h3><p style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:24px">Your file has been processed successfully.</p><button class="btn btn-primary" onclick="showNotification(\'Download started!\', \'success\')"><span class="material-symbols-rounded">download</span> Download File</button></div>';
            }, 3000);
        }

        showNotification('Processing "' + file.name + '"...', 'success');
    }

    // PRICING TOGGLE
    const pricingToggle = document.getElementById('pricingToggle');
    if (pricingToggle) {
        pricingToggle.addEventListener('change', function() {
            const amounts = document.querySelectorAll('.pricing-amount');
            amounts.forEach(function(el) {
                const monthly = el.getAttribute('data-monthly');
                const annual = el.getAttribute('data-annual');
                if (monthly && annual) {
                    el.textContent = pricingToggle.checked ? annual : monthly;
                }
            });
        });
    }

    // CONTACT FORM
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            showNotification('Message sent successfully! We\'ll get back to you soon.', 'success');
            this.reset();
        });
    }

    // ACTIVE NAV LINK
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-link, .mobile-menu a').forEach(function(link) {
        const href = link.getAttribute('href');
        if (href === currentPage) {
            link.classList.add('active');
        }
    });

    // TOOL CATEGORY FILTER
    document.querySelectorAll('.tool-category-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const category = this.dataset.category;
            document.querySelectorAll('.tool-category-btn').forEach(function(b) { b.classList.remove('active'); });
            this.classList.add('active');
            
            document.querySelectorAll('.tool-item').forEach(function(item) {
                if (category === 'all' || item.dataset.category === category) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    });

    // LANGUAGE SELECTION
    document.querySelectorAll('.language-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.language-btn').forEach(function(b) { b.style.borderColor = 'var(--border)'; b.style.background = '#fff'; });
            this.style.borderColor = 'var(--primary)';
            this.style.background = 'rgba(79,70,229,0.05)';
            showNotification('Language selected: ' + this.textContent.trim(), 'success');
        });
    });

});
