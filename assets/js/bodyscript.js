//stuff that loads after the DOM
window.onload = function() {

	// 0.3秒后隐藏加载动画
	setTimeout(function() {
		var loadingScreen = document.getElementById('loadingScreen');
		if (loadingScreen) {
			loadingScreen.classList.add('hidden');
		}
	}, 300);

//resizes main box so it fits within the window
	function textHeight(){
		var	fullHeight = document.documentElement.clientHeight,
			offsetHeight = 320;
		
		// Adjust offset for mobile devices
		if (window.innerWidth <= 768) {
			offsetHeight = 380; // More space for mobile layout
		}
		
		mainBox.style.height = Math.max(300, fullHeight - offsetHeight) + 'px';
		// mainBoxDecode 自适应高度，不设置固定高度
		if (mainBoxDecode) {
			mainBoxDecode.style.height = 'auto';
			mainBoxDecode.style.minHeight = 'auto';
		}
	}

	textHeight();
	updateContainerStyles();
	updateDecodeContainerStyles();

//fixes after inline styles were moved to css file
	// showKey.src = eyeImg;
	// if (showKeyDecode) {
	// 	showKeyDecode.src = eyeImg;
	// }

//event listeners for buttons etc.
	window.addEventListener('resize',function(){
		textHeight();
		// Force reflow for responsive layout
		setTimeout(function(){
			textHeight();
		}, 100);
	});
	
	// Handle orientation change for mobile devices
	window.addEventListener('orientationchange', function(){
		setTimeout(function(){
			textHeight();
		}, 100);
	});

	mainFile.addEventListener('change', loadFileAsURL);
	mainFile.addEventListener('click', function(){this.value = '';});

	imgFile.addEventListener('change', loadImage);
	imgFile.addEventListener('click', function(){this.value = '';});

	imageFile.addEventListener('change', importImage);
	imageFile.addEventListener('click', function(){this.value = '';});

	// Decode screen elements
	if (imageFileDecode) {
		imageFileDecode.addEventListener('change', importImageDecode);
		imageFileDecode.addEventListener('click', function(){this.value = '';});
	}

	// 嵌入方式选择器变化时保存
	encodeModeSelect.addEventListener('change', function() {
		localStorage.setItem('encodeMode', encodeModeSelect.value);
	});
	
	// 新的开始按钮事件监听器
	startEncodeBtn.addEventListener('click', function() {
		var mode = encodeModeSelect.value;
		// 保存当前选择的嵌入方式
		localStorage.setItem('encodeMode', mode);
		if (mode === 'png' || mode === 'jpg') {
			// 调用 encode 函数，通过设置一个临时属性来传递模式
			encode.call({ id: mode === 'png' ? 'encodePNGBtn' : 'encodeJPGBtn' });
		} else if (mode === 'tail') {
			appendToFileTail();
		}
	});

    decodeBtn.addEventListener('click', decode);

	clearBtn.addEventListener('click', function(){
		if (typeof clearManagedImageSourcesForContainer === 'function') {
			clearManagedImageSourcesForContainer(imageListBox);
		}
		mainBox.innerHTML = ''; 
		imageListBox.innerHTML = ''; 
		binaryFilesForTail = []; // 清理二进制文件数据
		textForTail = ''; // 清理文本数据
		updateContainerStyles(); 
		disableDownload();
	});
	
	downloadBtn.addEventListener('click', downloadProcessedImage);

	if (clearBtnDecode) {
		clearBtnDecode.addEventListener('click', function(){
			mainBoxDecode.innerHTML = ''; 
			imageListBoxDecode.innerHTML = '';
			revokeDecodeImageObjectUrls();
			// 重置待解码图片列表
			imagesToDecode = [];
			// 重置分块数据
			extractedChunks = [];
			expectedChunkCount = 0;
			updateDecodeContainerStyles(); 
			disableDecodeDownload();
		});
		
		// 为提取页面文本框添加事件监听器，允许插入但阻止编辑
		if (mainBoxDecode) {
			// 使用元素属性存储状态
			mainBoxDecode._lastContent = '';
			mainBoxDecode._allowInput = false;
			
			// 保存当前内容
			mainBoxDecode.addEventListener('focus', function(e) {
				mainBoxDecode._lastContent = mainBoxDecode.innerHTML;
			});
			
			// 监听输入事件，恢复到之前的内容（除非允许输入）
			mainBoxDecode.addEventListener('input', function(e) {
				if (mainBoxDecode._allowInput) {
					mainBoxDecode._lastContent = mainBoxDecode.innerHTML;
					mainBoxDecode._allowInput = false;
					return;
				}
				if (!e.isTrusted) return;
				mainBoxDecode.innerHTML = mainBoxDecode._lastContent;
			});
			
			// 阻止删除、修改等编辑操作
			mainBoxDecode.addEventListener('keydown', function(e) {
				// 只允许Ctrl+V（粘贴）、Ctrl+A（全选）、Ctrl+C（复制）
				if (e.ctrlKey && ['KeyA', 'KeyC', 'KeyV'].includes(e.code)) {
					// 允许这些操作
				} else {
					// 阻止所有其他按键操作
					e.preventDefault();
				}
			});
			
			// 阻止中文输入法
			mainBoxDecode.addEventListener('compositionstart', function(e) {
				e.preventDefault();
			});
			
			mainBoxDecode.addEventListener('compositionend', function(e) {
				e.preventDefault();
				mainBoxDecode.innerHTML = mainBoxDecode._lastContent;
			});
			
			mainBoxDecode.addEventListener('textInput', function(e) {
				e.preventDefault();
			});
			
			// 阻止剪切操作
			mainBoxDecode.addEventListener('cut', function(e) {
				e.preventDefault();
			});
			
			// 允许粘贴操作
			mainBoxDecode.addEventListener('paste', function(e) {
				mainBoxDecode._allowInput = true;
			});
			
			// 阻止拖拽操作
			mainBoxDecode.addEventListener('dragstart', function(e) {
				e.preventDefault();
			});
			
			// 阻止鼠标事件导致的编辑
			mainBoxDecode.addEventListener('mousedown', function(e) {
				// 允许选择文本，但阻止其他鼠标操作
			});
			
			// 阻止内容可编辑性
			mainBoxDecode.addEventListener('beforeinput', function(e) {
				e.preventDefault();
			});
			
			// 阻止键盘事件的默认行为
			mainBoxDecode.addEventListener('keypress', function(e) {
				e.preventDefault();
			});
			
			// 处理图片容器的点击事件，实现全屏预览
			mainBoxDecode.addEventListener('click', handleImageContainerClick);
			
			// 阻止在图片容器中进行任何输入操作
			mainBoxDecode.addEventListener('focusin', function(e) {
				const imageContainer = e.target.closest('.cover-image-list-item, .image-list-item, .carrier-library-item, img');
				if (imageContainer) {
					// 如果焦点进入图片容器或图片本身，将焦点移开
					mainBoxDecode.focus();
				}
			});
			
			// 为所有图片元素添加事件监听器
			function addImageListeners() {
				const images = mainBoxDecode.querySelectorAll('img');
				images.forEach(function(img) {
					// 阻止图片上的焦点事件
					img.addEventListener('focus', function(e) {
						e.preventDefault();
						mainBoxDecode.focus();
					});
					
					// 阻止图片上的输入事件
					img.addEventListener('beforeinput', function(e) {
						e.preventDefault();
						e.stopPropagation();
					});
					
					// 阻止图片上的键盘事件
					img.addEventListener('keydown', function(e) {
						e.preventDefault();
						e.stopPropagation();
					});
				});
			}
			
			// 初始添加图片监听器
			addImageListeners();
			
			// 监听DOM变化，为新添加的图片也添加监听器
			const imageObserver = new MutationObserver(function(mutations) {
				mutations.forEach(function(mutation) {
					if (mutation.type === 'childList') {
						addImageListeners();
					}
				});
			});
			
			imageObserver.observe(mainBoxDecode, {
				childList: true,
				subtree: true
			});

			mainBoxDecode.setAttribute('contenteditable', 'false');
			mainBoxDecode.setAttribute('tabindex', '-1');
			mainBoxDecode.setAttribute('spellcheck', 'false');

			function forceDecodeReadOnlyState() {
				if (document.activeElement === mainBoxDecode && typeof mainBoxDecode.blur === 'function') {
					mainBoxDecode.blur();
				}
				if (document.activeElement && mainBoxDecode.contains(document.activeElement) && typeof document.activeElement.blur === 'function') {
					document.activeElement.blur();
				}
			}

			['focus', 'beforeinput', 'input', 'keypress', 'compositionstart', 'compositionupdate', 'compositionend', 'textInput', 'paste', 'cut'].forEach(function(eventName) {
				mainBoxDecode.addEventListener(eventName, function(e) {
					e.preventDefault();
					forceDecodeReadOnlyState();
				}, true);
			});

			mainBoxDecode.addEventListener('keydown', function(e) {
				if (e.ctrlKey && ['KeyA', 'KeyC'].includes(e.code)) {
					return;
				}
				e.preventDefault();
				forceDecodeReadOnlyState();
			}, true);

			mainBoxDecode.addEventListener('focusin', function() {
				forceDecodeReadOnlyState();
			}, true);
		}
	}
	
	// 为整个页面的所有图片容器添加点击事件监听器
	function addImageContainerListeners() {
		// 为所有图片容器添加点击事件
		const imageContainers = document.querySelectorAll('.cover-image-list-item, .image-list-item, .carrier-library-item');
		imageContainers.forEach(function(container) {
			// 移除旧的监听器，避免重复添加
			container.removeEventListener('click', handleImageContainerClick);
			container.addEventListener('click', handleImageContainerClick);
		});
	}
	
	// 图片容器点击处理函数
let fullscreenPreviewItems = [];
let fullscreenPreviewIndex = 0;

function collectPreviewItems(containerRoot) {
	if (!containerRoot) return [];
	const imageNodes = containerRoot.querySelectorAll('.cover-image-list-item img, .image-list-item img, .carrier-library-item img, .extracted-result-content img, .stego-image-section img');
	return Array.from(imageNodes).map(function(img) {
		let dataUrl = img.src;
		if (typeof getFullscreenImageSourceFromElement === 'function') {
			dataUrl = getFullscreenImageSourceFromElement(img) || dataUrl;
		} else if (typeof getFullImageSourceFromElement === 'function') {
			dataUrl = getFullImageSourceFromElement(img) || dataUrl;
		} else if (img.getAttribute('data-fullsrc')) {
			dataUrl = img.getAttribute('data-fullsrc');
		}
		return {
			dataUrl: dataUrl,
			sourceEl: img
		};
	}).filter(function(item) {
		return !!item.dataUrl;
	});
}

function renderFullscreenPreview() {
	const img = document.getElementById('fullscreenPreviewImage');
	const prevBtn = document.getElementById('fullscreenPreviewPrev');
	const nextBtn = document.getElementById('fullscreenPreviewNext');
	const counterEl = document.getElementById('fullscreenPreviewCounter');
	const currentItem = fullscreenPreviewItems[fullscreenPreviewIndex];
	if (!img || !prevBtn || !nextBtn || !counterEl || !currentItem) return;
	img.src = currentItem.dataUrl;
	counterEl.textContent = '(' + (fullscreenPreviewIndex + 1) + '/' + fullscreenPreviewItems.length + ')';
	prevBtn.disabled = fullscreenPreviewItems.length <= 1;
	nextBtn.disabled = fullscreenPreviewItems.length <= 1;
}

function handleImageContainerClick(e) {
		// 检查点击的元素是否在图片容器内
		const clickedImage = e.target.closest('img');
		const imageContainer = e.target.closest('.cover-image-list-item, .image-list-item, .carrier-library-item');
		if (imageContainer || clickedImage) {
			// 阻止默认行为
			e.preventDefault();
			
			// 尝试获取图片信息
			const imgElement = clickedImage || imageContainer.querySelector('img');
			if (imgElement) {
				let previewSource = imgElement.src;
				if (typeof getFullscreenImageSourceFromElement === 'function') {
					previewSource = getFullscreenImageSourceFromElement(imgElement) || imgElement.src;
				} else if (typeof getFullImageSourceFromElement === 'function') {
					previewSource = getFullImageSourceFromElement(imgElement) || imgElement.src;
				} else if (imgElement.getAttribute('data-fullsrc')) {
					previewSource = imgElement.getAttribute('data-fullsrc');
				}

				// 获取图片名称
				let imageName = '未知图片';
				const nameElement = imageContainer.querySelector('.image-filename');
				if (nameElement) {
					imageName = nameElement.textContent || imageName;
				}
				
				// 获取图片大小（如果可用）
				let imageSize = 0;
				const sizeElement = imageContainer.querySelector('.image-details');
				if (sizeElement) {
					// 尝试从详情中提取大小信息
					const sizeMatch = sizeElement.textContent.match(/(\d+\.\d+|\d+)\s*KB/);
					if (sizeMatch) {
						imageSize = parseFloat(sizeMatch[1]) * 1024; // 转换为字节
					}
				}
				
				// 显示全屏预览
				if (typeof showFullscreenPreview === 'function') {
					const previewItems = collectPreviewItems(document.getElementById('mainBoxDecode') || document.body);
					showFullscreenPreview({
						dataUrl: previewSource,
						items: previewItems.length ? previewItems : [{ dataUrl: previewSource, sourceEl: imgElement }],
						sourceEl: imgElement
					});
				}
			}
		}
	}
	
	// 初始添加图片容器监听器
	addImageContainerListeners();
	
	// 监听DOM变化，为新添加的图片容器也添加监听器
	const containerObserver = new MutationObserver(function(mutations) {
		mutations.forEach(function(mutation) {
			if (mutation.type === 'childList') {
				addImageContainerListeners();
			}
		});
	});
	
	containerObserver.observe(document.body, {
		childList: true,
		subtree: true
	});
	
	// 全屏预览功能
	function showFullscreenPreview(item) {
		const modal = document.getElementById('fullscreenPreviewModal');
		const img = document.getElementById('fullscreenPreviewImage');
		const closeBtn = document.getElementById('fullscreenPreviewClose');
		const prevBtn = document.getElementById('fullscreenPreviewPrev');
		const nextBtn = document.getElementById('fullscreenPreviewNext');
		
		if (!modal || !img || !closeBtn || !prevBtn || !nextBtn) return;
		
		// 设置图片和信息
		img.src = item.dataUrl;
		fullscreenPreviewItems = Array.isArray(item.items) && item.items.length ? item.items : [{ dataUrl: item.dataUrl, sourceEl: item.sourceEl || null }];
		fullscreenPreviewIndex = fullscreenPreviewItems.findIndex(function(previewItem) {
			return previewItem.sourceEl && item.sourceEl && previewItem.sourceEl === item.sourceEl;
		});
		if (fullscreenPreviewIndex < 0) {
			fullscreenPreviewIndex = 0;
		}
		
		// 显示弹窗
		modal.style.display = 'flex';
		renderFullscreenPreview();
		
		// 绑定关闭事件
		closeBtn.onclick = closeFullscreenPreview;
		prevBtn.onclick = function(e) {
			e.stopPropagation();
			if (fullscreenPreviewItems.length <= 1) return;
			fullscreenPreviewIndex = (fullscreenPreviewIndex - 1 + fullscreenPreviewItems.length) % fullscreenPreviewItems.length;
			renderFullscreenPreview();
		};
		nextBtn.onclick = function(e) {
			e.stopPropagation();
			if (fullscreenPreviewItems.length <= 1) return;
			fullscreenPreviewIndex = (fullscreenPreviewIndex + 1) % fullscreenPreviewItems.length;
			renderFullscreenPreview();
		};
		img.onclick = function(e) {
			e.stopPropagation();
			togglePreviewNativeFullscreen();
		};
		
		// 点击背景关闭
		modal.onclick = function(e) {
			if (e.target === modal) {
				closeFullscreenPreview();
			}
		};
		
		// 按ESC关闭
		document.addEventListener('keydown', handleEscKey);
	}
	
	// 关闭全屏预览
	function closeFullscreenPreview() {
		const modal = document.getElementById('fullscreenPreviewModal');
		if (modal) {
			modal.style.display = 'none';
			modal.classList.remove('is-native-fullscreen');
		}
		if (document.fullscreenElement && document.exitFullscreen) {
			document.exitFullscreen().catch(function() {});
		}
		fullscreenPreviewItems = [];
		fullscreenPreviewIndex = 0;
		document.removeEventListener('keydown', handleEscKey);
	}
	
	// ESC键处理
	function handleEscKey(e) {
		if (e.key === 'Escape') {
			closeFullscreenPreview();
		} else if (e.key === 'ArrowLeft' && fullscreenPreviewItems.length > 1) {
			e.preventDefault();
			fullscreenPreviewIndex = (fullscreenPreviewIndex - 1 + fullscreenPreviewItems.length) % fullscreenPreviewItems.length;
			renderFullscreenPreview();
		} else if (e.key === 'ArrowRight' && fullscreenPreviewItems.length > 1) {
			e.preventDefault();
			fullscreenPreviewIndex = (fullscreenPreviewIndex + 1) % fullscreenPreviewItems.length;
			renderFullscreenPreview();
		}
	}
	
	// 格式化文件大小
	function togglePreviewNativeFullscreen() {
		const content = document.getElementById('fullscreenPreviewContent');
		if (!content || !content.requestFullscreen) return;
		if (document.fullscreenElement) {
			document.exitFullscreen().catch(function() {});
			return;
		}
		content.requestFullscreen().catch(function() {});
	}

	document.addEventListener('fullscreenchange', function() {
		const modal = document.getElementById('fullscreenPreviewModal');
		if (!modal) return;
		modal.classList.toggle('is-native-fullscreen', !!document.fullscreenElement);
	});
	
	// 下载按钮事件
	if (downloadBtnDecode) {
		downloadBtnDecode.addEventListener('click', openDownloadModal);
	}
	
	// 弹窗关闭按钮事件
	if (downloadModalClose) {
		downloadModalClose.addEventListener('click', closeDownloadModal);
	}
	
	// 点击弹窗外部关闭
	if (downloadModal) {
		downloadModal.addEventListener('click', function(e) {
			if (e.target === downloadModal) {
				closeDownloadModal();
			}
		});
	}
	
	// 下载所有文件按钮事件
	if (document.getElementById('downloadAllFilesBtn')) {
		document.getElementById('downloadAllFilesBtn').addEventListener('click', downloadAllFiles);
	}
	
	// 打包下载按钮事件
	if (packageDownloadBtn) {
		packageDownloadBtn.addEventListener('click', packageDownload);
	}



//	showPwdMode.addEventListener('click', showPwd);
	// showKey.addEventListener('click', showPwd);

	// if (showKeyDecode) {
	// 	showKeyDecode.addEventListener('click', showPwdDecode);
	// }


	
	// 链接自动识别和转换函数 - 增强版
	function linkifyText(text, isDecodeScreen = false) {
		// 更强大的URL匹配正则表达式，能识别被各种字符包裹的URL
		// 支持：[url], (url), {url}, <url>, "url", 'url', ·url, ·url·, +url+ 等
		// 改进版本：更宽松的匹配，支持手机端常见的输入格式
		const urlRegex = /(?:^|[\s\(\[\{\<\'\"\·\+\-\*\=\_\`\~\,\;\?\！\？\，\；\：\：\[\]【】「」『』《》〈〉（）〔〕｛｝])(https?:\/\/[^\s\)\]\}\>\'\\"\·\+\-\*\=\_\`\~\,\;\?\！\？\，\；\：\：\[\]【】「」『』《》〈〉（）〔〕｛｝]+)(?:$|[\s\)\]\}\>\'\\"\·\+\-\*\=\_\`\~\,\;\?\！\？\，\；\：\：\[\]【】「」『』《》〈〉（）〔〕｛｝])/gi;
		
		// 替换文本中的URL为链接
		let result = text;
		let match;
		let lastIndex = 0;
		let newText = '';
		const matches = [];
		
		// 先收集所有匹配，避免正则表达式在替换过程中的问题
		urlRegex.lastIndex = 0;
		while ((match = urlRegex.exec(text)) !== null) {
			matches.push({
				index: match.index,
				fullLength: match[0].length,
				url: match[1],
				prefixLength: match[0].indexOf(match[1]),
				suffixLength: match[0].length - match[0].indexOf(match[1]) - match[1].length
			});
		}
		
		// 处理匹配，构建新文本
		for (let i = 0; i < matches.length; i++) {
			const currentMatch = matches[i];
			// 添加匹配前的文本
			newText += text.substring(lastIndex, currentMatch.index);
			
			// 添加前缀字符
			if (currentMatch.prefixLength > 0) {
				newText += text.substring(currentMatch.index, currentMatch.index + currentMatch.prefixLength);
			}
			
			// 添加链接 - 嵌入页面不添加 target="_blank"，提取页面添加
			if (isDecodeScreen) {
				newText += `<a href="${currentMatch.url}" target="_blank">${currentMatch.url}</a>`;
			} else {
				newText += `<a href="${currentMatch.url}">${currentMatch.url}</a>`;
			}
			
			// 添加后缀字符
			if (currentMatch.suffixLength > 0) {
				newText += text.substring(
					currentMatch.index + currentMatch.prefixLength + currentMatch.url.length,
					currentMatch.index + currentMatch.fullLength
				);
			}
			
			lastIndex = currentMatch.index + currentMatch.fullLength;
		}
		
		// 添加剩余的文本
		newText += text.substring(lastIndex);
		
		return newText;
	}
	
	// 阻止嵌入页面链接跳转的函数
	function preventEncodeLinksNavigation(container) {
		var links = container.querySelectorAll('a');
		links.forEach(function(link) {
			// 移除之前可能存在的事件监听器
			link.removeEventListener('click', preventLinkClick);
			// 添加新的事件监听器
			link.addEventListener('click', preventLinkClick);
		});
	}
	
	// 阻止链接点击的回调函数
	function preventLinkClick(e) {
		e.preventDefault();
		e.stopPropagation();
		return false;
	}
	
	// 扫描并转换容器中的纯文本链接为可点击链接
	function scanAndConvertLinks(container, isDecodeScreen = false) {
		// 获取容器中的所有文本节点
		var walker = document.createTreeWalker(
			container,
			NodeFilter.SHOW_TEXT,
			null,
			false
		);
		
		var textNodes = [];
		var node;
		while (node = walker.nextNode()) {
			// 跳过已经在链接内的文本节点
			if (!node.parentElement.closest('a')) {
				textNodes.push(node);
			}
		}
		
		// 处理每个文本节点
		textNodes.forEach(function(textNode) {
			var text = textNode.nodeValue;
			var linkedText = linkifyText(text, isDecodeScreen);
			
			// 如果文本被修改了（包含链接），则替换原文本节点
			if (linkedText !== text) {
				var tempDiv = document.createElement('div');
				tempDiv.innerHTML = linkedText;
				
				// 将新内容插入到原文本节点的位置
				var parent = textNode.parentNode;
				while (tempDiv.firstChild) {
					parent.insertBefore(tempDiv.firstChild, textNode);
				}
				parent.removeChild(textNode);
			}
		});
		
		// 确保新创建的链接有正确的属性
		if (isDecodeScreen) {
			// 提取页面，确保链接可以跳转
			makeDecodeLinksClickable(container);
		} else {
			// 嵌入页面，确保链接不可编辑且不可跳转
			makeLinksNonEditable(container);
			preventEncodeLinksNavigation(container);
		}
	}
	
	// 处理输入事件，在用户输入完成后自动转换链接
	function handleInput() {
		// 延迟执行，让输入稳定下来
		setTimeout(function() {
			// 扫描并转换嵌入页面的链接
			scanAndConvertLinks(mainBox, false);
		}, 300);
		
		// 更新容量
		if(preview.src.slice(0,4) == 'data' && (!isEncodingInProgress && Date.now() >= encodingCompleteCooldown)) {
			updateCapacity();
		}
	}
	
	// 防抖函数，用于输入事件
	function debounce(func, wait) {
		let timeout;
		return function executedFunction(...args) {
			const later = () => {
				clearTimeout(timeout);
				func(...args);
			};
			clearTimeout(timeout);
			timeout = setTimeout(later, wait);
		};
	}
	
	// 处理输入事件的防抖版本
	const debouncedHandleInput = debounce(handleInput, 500);
	
	// 处理粘贴事件，自动转换链接
	function handlePaste(event) {
		// 阻止默认粘贴行为
		event.preventDefault();
		
		// 获取粘贴的文本
		const pastedText = (event.clipboardData || window.clipboardData).getData('text');
		
		// 先插入纯文本
		document.execCommand('insertText', false, pastedText);
		
		// 延迟一点，然后扫描并转换链接
		setTimeout(function() {
			scanAndConvertLinks(mainBox, false);
		}, 100);
		
		// 更新容量
		if(preview.src.slice(0,4) == 'data' && (!isEncodingInProgress && Date.now() >= encodingCompleteCooldown)) {
			updateCapacity();
		}
	}
	
	// 使用防抖和更高效的事件监听
	mainBox.addEventListener('paste', handlePaste);
	
	// 使用 MutationObserver 替代 DOMSubtreeModified（性能更优）
	var imageListObserver = new MutationObserver(function(mutations) {
		if(preview.src.slice(0,4) == 'data' && (!isEncodingInProgress && Date.now() >= encodingCompleteCooldown)) {
			updateCapacity();
		}
	});
	
	// 配置观察器：只观察子节点变化
	imageListObserver.observe(imageListBox, {
		childList: true,
		subtree: false
	});
	
	// 监听 mainBox 的 input 事件
	mainBox.addEventListener('input', debouncedHandleInput);

	// 富文本编辑功能已移除，仅保留图片和文件导入
	

	
	// 显示/隐藏折叠栏的函数
	function toggleCarrierLibraryPanel(show) {
		var carrierLibraryPanel = document.getElementById('carrierLibraryPanel');
		if (carrierLibraryPanel) {
			if (show) {
				carrierLibraryPanel.classList.add('panel-visible');
			} else {
				carrierLibraryPanel.classList.remove('panel-visible');
			}
		}
	}
	
	// Navigation bar events
	navEncode.addEventListener('click', function() {
		navEncode.classList.add('active');
		navDecode.classList.remove('active');
		encodeScr.style.display = 'block';
		decodeScr.style.display = 'none';
		// 显示折叠栏
		toggleCarrierLibraryPanel(true);
		// 保存导航栏状态到 localStorage
		localStorage.setItem('navBarActive', 'encode');
	});
	
	navDecode.addEventListener('click', function() {
		navDecode.classList.add('active');
		navEncode.classList.remove('active');
		decodeScr.style.display = 'block';
		encodeScr.style.display = 'none';
		// 隐藏折叠栏
		toggleCarrierLibraryPanel(false);
		// 保存导航栏状态到 localStorage
		localStorage.setItem('navBarActive', 'decode');
	});
	
	// 从 localStorage 恢复导航栏状态
	function restoreNavBarState() {
		const activeNav = localStorage.getItem('navBarActive');
		if (activeNav === 'decode') {
			navDecode.classList.add('active');
			navEncode.classList.remove('active');
			decodeScr.style.display = 'block';
			encodeScr.style.display = 'none';
			// 隐藏折叠栏
			toggleCarrierLibraryPanel(false);
		} else {
			// 默认显示嵌入页面
			navEncode.classList.add('active');
			navDecode.classList.remove('active');
			encodeScr.style.display = 'block';
			decodeScr.style.display = 'none';
			// 显示折叠栏
			toggleCarrierLibraryPanel(true);
		}
	}
	
	// 从 localStorage 恢复嵌入方式
	function restoreEncodeMode() {
		const savedMode = localStorage.getItem('encodeMode');
		if (savedMode) {
			encodeModeSelect.value = savedMode;
		}
	}
	
	// 调用恢复函数
	restoreNavBarState();
		restoreEncodeMode();
		
		var navGuide = document.getElementById('navGuide');
		var guideScr = document.getElementById('guideScr');
		var guideBackBtn = document.getElementById('guideBackBtn');
		var MAIN_VIEW_TRANSITION_MS = 220;
		var mainViewTransitionTimer = null;
		var activeMainView = decodeScr.style.display !== 'none' ? 'decode' : 'encode';
		var lastToolView = localStorage.getItem('lastToolView') || activeMainView;
		
		function getMainScreen(viewName) {
			if (viewName === 'decode') return decodeScr;
			if (viewName === 'guide') return guideScr;
			return encodeScr;
		}
		
		function setActiveNavItem(viewName) {
			navEncode.classList.toggle('active', viewName === 'encode');
			navDecode.classList.toggle('active', viewName === 'decode');
			if (navGuide) {
				navGuide.classList.toggle('active', viewName === 'guide');
			}
		}
		
		function hideMainScreen(screen) {
			if (!screen) return;
			screen.style.display = 'none';
			screen.classList.remove('screen-pre-enter');
			screen.classList.remove('screen-exit');
		}
		
		function showMainScreen(screen, immediate) {
			if (!screen) return;
			screen.style.display = 'block';
			screen.classList.remove('screen-exit');
			if (immediate) {
				screen.classList.remove('screen-pre-enter');
				return;
			}
			screen.classList.add('screen-pre-enter');
			requestAnimationFrame(function() {
				requestAnimationFrame(function() {
					screen.classList.remove('screen-pre-enter');
				});
			});
		}
		
		function applyMainView(viewName, options) {
			var config = options || {};
			var immediate = !!config.immediate;
			var nextScreen = getMainScreen(viewName);
			var currentScreen = getMainScreen(activeMainView);
			
			if (!nextScreen) return;
			
			if (viewName === 'guide') {
				if (activeMainView === 'encode' || activeMainView === 'decode') {
					lastToolView = activeMainView;
					localStorage.setItem('lastToolView', lastToolView);
				}
			} else {
				lastToolView = viewName;
				localStorage.setItem('lastToolView', lastToolView);
			}
			
			setActiveNavItem(viewName);
			toggleCarrierLibraryPanel(viewName === 'encode');
			localStorage.setItem('navBarActive', viewName);
			window.scrollTo(0, 0);
			
			if (mainViewTransitionTimer) {
				clearTimeout(mainViewTransitionTimer);
				mainViewTransitionTimer = null;
			}
			
			if (currentScreen === nextScreen) {
				showMainScreen(nextScreen, true);
				activeMainView = viewName;
				return;
			}
			
			if (immediate || !currentScreen) {
				hideMainScreen(encodeScr);
				hideMainScreen(decodeScr);
				hideMainScreen(guideScr);
				showMainScreen(nextScreen, true);
				activeMainView = viewName;
				return;
			}
			
			currentScreen.classList.remove('screen-pre-enter');
			currentScreen.classList.add('screen-exit');
			
			mainViewTransitionTimer = setTimeout(function() {
				hideMainScreen(encodeScr);
				hideMainScreen(decodeScr);
				hideMainScreen(guideScr);
				showMainScreen(nextScreen, false);
				activeMainView = viewName;
				mainViewTransitionTimer = null;
			}, MAIN_VIEW_TRANSITION_MS);
		}
		
		function interceptViewSwitch(viewName) {
			return function(e) {
				e.preventDefault();
				e.stopImmediatePropagation();
				applyMainView(viewName);
			};
		}
		
		navEncode.addEventListener('click', interceptViewSwitch('encode'), true);
		navDecode.addEventListener('click', interceptViewSwitch('decode'), true);
		
		if (navGuide) {
			navGuide.addEventListener('click', interceptViewSwitch('guide'), true);
		}
		
		if (guideBackBtn) {
			guideBackBtn.addEventListener('click', function(e) {
				e.preventDefault();
				applyMainView(lastToolView || 'encode');
			});
		}
		
		var savedMainView = localStorage.getItem('navBarActive');
		if (savedMainView !== 'decode' && savedMainView !== 'guide') {
			savedMainView = 'encode';
		}
		applyMainView(savedMainView, { immediate: true });
	
	// 提取页面链接点击事件处理
	function setupDecodeLinksClickable() {
		if (mainBoxDecode) {
			mainBoxDecode.addEventListener('click', function(e) {
				var target = e.target;
				// 检查点击的是否是链接
				if (target.tagName === 'A' && target.getAttribute('href')) {
					e.preventDefault();
					e.stopPropagation();
					var href = target.getAttribute('href');
					// 如果是 data URL（下载链接），直接触发下载
					if (href.startsWith('data:')) {
						var downloadName = target.getAttribute('download') || 'download';
						var link = document.createElement('a');
						link.href = href;
						link.download = downloadName;
						document.body.appendChild(link);
						link.click();
						document.body.removeChild(link);
					} else if (href.startsWith('http://') || href.startsWith('https://')) {
						// 如果是普通 URL，在新窗口打开
						window.open(href, '_blank');
					}
				}
			});
		}
	}
	
	// 初始化链接点击功能
	setupDecodeLinksClickable();
	
	// 链接整体处理功能
	function setupLinkAsWhole() {
		// 处理嵌入页面的链接
		if (mainBox) {
			setupLinkContainer(mainBox);
		}
		// 处理提取页面的链接
		if (mainBoxDecode) {
			setupLinkContainer(mainBoxDecode);
		}
	}
	
	// 设置链接容器的事件监听 - 简化版，支持链接换行编辑
	function setupLinkContainer(container) {
		// 监听键盘事件，处理删除
		container.addEventListener('keydown', function(e) {
			// 处理删除键和退格键
			if (e.key === 'Delete' || e.key === 'Backspace') {
				var selection = window.getSelection();
				if (selection.rangeCount > 0) {
					var range = selection.getRangeAt(0);
					
					// 只在选中内容完全在链接内部时才删除链接
					var link = null;
					
					// 检查光标/选择是否完全在链接内部
					function isCursorInsideLink(testLink, testRange) {
						try {
							var linkRange = document.createRange();
							linkRange.selectNodeContents(testLink);
							
							// 检查范围是否在链接范围内
							var startInLink = testRange.comparePoint(testRange.startContainer, testRange.startOffset, testLink) <= 0;
							var endInLink = testRange.comparePoint(testRange.endContainer, testRange.endOffset, testLink) >= 0;
							
							return startInLink && endInLink;
						} catch (err) {
							return false;
						}
					}
					
					// 方法1：从祖先找（最准确）
					var ancestor = range.commonAncestorContainer;
					if (ancestor.nodeType === 1) {
						link = ancestor.closest('a');
					} else if (ancestor.parentElement) {
						link = ancestor.parentElement.closest('a');
					}
					
					// 方法2：检查起始位置是否在链接内
					if (!link && range.startContainer) {
						if (range.startContainer.nodeType === 1) {
							link = range.startContainer.closest('a');
						} else if (range.startContainer.parentElement) {
							link = range.startContainer.parentElement.closest('a');
						}
					}
					
					// 方法3：检查结束位置是否在链接内
					if (!link && range.endContainer) {
						if (range.endContainer.nodeType === 1) {
							link = range.endContainer.closest('a');
						} else if (range.endContainer.parentElement) {
							link = range.endContainer.parentElement.closest('a');
						}
					}
					
					// 只有当我们确实找到了链接，并且光标/选择在链接内时，才执行整体删除
					if (link) {
						// 验证光标/选择确实在链接内部
						var isInside = false;
						try {
							var linkRange = document.createRange();
							linkRange.selectNodeContents(link);
							
							// 使用更简单的检查：看起始或结束容器是否是链接的子节点
							var startNode = range.startContainer;
							var endNode = range.endContainer;
							
							isInside = link.contains(startNode) || link.contains(endNode);
						} catch (err) {
							isInside = false;
						}
						
						if (isInside) {
							// 找到了链接，并且光标在链接内，整体删除
							e.preventDefault();
							link.remove();
							return;
						}
					}
				}
			}
		});
		
		// 监听点击，点击链接时选中整个链接
		container.addEventListener('click', function(e) {
			var target = e.target;
			var link = target.closest ? target.closest('a') : (target.parentElement ? target.parentElement.closest('a') : null);
			
			if (link && window.getSelection().isCollapsed) {
				// 只有在没有选中文本时才选中整个链接
				var selection = window.getSelection();
				var range = document.createRange();
				range.selectNodeContents(link);
				selection.removeAllRanges();
				selection.addRange(range);
			}
		});
	}
	
	// 初始化链接整体功能
	setupLinkAsWhole();
	
	// 初始化WebP转换开关
	var webpConverterToggle = document.getElementById('webpConverterToggle');
	var webpConverterContainer = document.querySelector('.webp-converter-container');
	var webpQualityReduction = document.getElementById('webpQualityReduction');
	
	// 从localStorage恢复设置
	if (webpConverterToggle) {
		var savedToggleState = localStorage.getItem('webpConverterEnabled');
		if (savedToggleState === 'true') {
			webpConverterToggle.checked = true;
		}
	}
	
	if (webpQualityReduction) {
		var savedQualityValue = localStorage.getItem('webpQualityReduction');
		if (savedQualityValue !== null) {
			var value = parseInt(savedQualityValue);
			if (!isNaN(value) && value >= 0 && value <= 100) {
				webpQualityReduction.textContent = value;
			}
		}
	}
	
	if (webpConverterToggle && webpConverterContainer) {
		// 初始化状态
		if (webpConverterToggle.checked) {
			webpConverterContainer.classList.add('enabled');
		}
		
		// 监听开关变化
		webpConverterToggle.addEventListener('change', function() {
			if (this.checked) {
				webpConverterContainer.classList.add('enabled');
			} else {
				webpConverterContainer.classList.remove('enabled');
			}
			
			// 保存开关状态到localStorage
			localStorage.setItem('webpConverterEnabled', this.checked);
		});
	}
	
	// 质量值点击编辑功能
	if (webpQualityReduction) {
		// 点击span时变成可编辑的输入框
		webpQualityReduction.addEventListener('click', function() {
			// 如果已经在编辑状态，不重复处理
			if (this.classList.contains('editing')) {
				return;
			}
			
			// 标记为编辑状态
			this.classList.add('editing');
			
			// 获取当前值
			var currentValue = parseInt(this.textContent) || 20;
			
			// 创建输入框
			var input = document.createElement('input');
			input.type = 'number';
			input.className = 'quality-input-edit';
			input.value = currentValue;
			input.min = 0;
			input.max = 100;
			
			// 替换span内容为输入框
			this.textContent = '';
			this.appendChild(input);
			
			// 聚焦并选中
			input.focus();
			input.select();
			
			// 实时验证输入
			input.addEventListener('input', function() {
				var value = parseInt(this.value);
				
				// 如果输入无效或超出范围，自动纠正
				if (isNaN(value) || this.value === '') {
					// 允许暂时为空，在blur时处理
					return;
				}
				
				if (value < 0) {
					this.value = 0;
				} else if (value > 100) {
					this.value = 100;
				}
			});
			
			// 失去焦点时保存值
			input.addEventListener('blur', function() {
				var value = parseInt(this.value);
				
				// 验证值
				if (isNaN(value) || this.value === '') {
					value = 20; // 默认值
				} else if (value < 0) {
					value = 0;
				} else if (value > 100) {
					value = 100;
				}
				
				// 移除输入框，恢复span显示
				var parent = this.parentNode;
				parent.textContent = value;
				parent.classList.remove('editing');
				
				// 保存质量值到localStorage
				localStorage.setItem('webpQualityReduction', value);
			});
			
			// 按Enter键保存
			input.addEventListener('keydown', function(e) {
				if (e.key === 'Enter') {
					this.blur();
				}
			});
			
			// 按Escape键取消编辑
			input.addEventListener('keydown', function(e) {
				if (e.key === 'Escape') {
					var parent = this.parentNode;
					parent.textContent = currentValue;
					parent.classList.remove('editing');
				}
			});
		});
	}
}

// Additional functions for decode screen
function revokeDecodeImageObjectUrls() {
	if (!imagesToDecode || !imagesToDecode.length) return;

	imagesToDecode.forEach(function(item) {
		if (item && item.objectUrl) {
			try {
				URL.revokeObjectURL(item.objectUrl);
			} catch (e) {}
		}
	});
}

function importImageDecode() {
	var files = imageFileDecode.files;
	if (!files || files.length === 0) return;

	var fileList = Array.from(files);

	revokeDecodeImageObjectUrls();
	
	// 重置待解码图片列表
	imagesToDecode = [];
	// 重置分块数据
	extractedChunks = [];
	expectedChunkCount = 0;
	
	// 计算总容量
	var totalSize = 0;
	for (var i = 0; i < fileList.length; i++) {
		totalSize += fileList[i].size;
	}
	
	// 显示图片列表容器
	var imageListBoxDecode = document.getElementById('imageListBoxDecode');
	imageListBoxDecode.innerHTML = '';
	imageListBoxDecode.style.display = 'block';
	
	var loadedCount = 0;
	var totalFiles = fileList.length;

	function finishDecodeImport() {
		imageMsgDecode.textContent = '已导入 ' + totalFiles + ' 个图像，总容量：' + formatFileSize(totalSize) + '，点击提取按钮开始处理';
		updateDecodeContainerStyles();
	}

	function processNextDecodeImage(index) {
		if (index >= totalFiles) {
			finishDecodeImport();
			return;
		}

		var file = fileList[index];
		var objectUrl = URL.createObjectURL(file);

		function continueAfterImport(dataUrl) {
			imagesToDecode.push({
				name: file.name,
				dataUrl: dataUrl,
				objectUrl: objectUrl,
				file: file
			});

			if (window.appendManagedImagePreview) {
				window.appendManagedImagePreview(imageListBoxDecode, {
					fileName: file.name,
					fullSource: file,
					viewSource: file,
					previewSource: file,
					itemClass: 'decode-image-container',
					imageClass: 'decode-thumbnail',
					labelClass: 'decode-filename'
				});
			} else {
				var imageItem = document.createElement('div');
				imageItem.className = 'decode-image-container';
				imageItem.innerHTML = '<img src="' + objectUrl + '" class="decode-thumbnail"><span class="decode-filename">' + file.name + '</span>';
				imageListBoxDecode.appendChild(imageItem);
			}

			loadedCount++;
			imageMsgDecode.textContent = '正在导入第 ' + loadedCount + '/' + totalFiles + ' 个图像...';

			setTimeout(function() {
				processNextDecodeImage(index + 1);
			}, 0);
		}

		function handleDataUrlReady(error, dataUrl) {
			if (error || !dataUrl) {
				console.error('读取解码图片失败:', file.name, error);
				try {
					URL.revokeObjectURL(objectUrl);
				} catch (e) {}
				loadedCount++;
				imageMsgDecode.textContent = '导入失败，已跳过：' + file.name;
				setTimeout(function() {
					processNextDecodeImage(index + 1);
				}, 0);
				return;
			}

			continueAfterImport(dataUrl);
		}

		if (window.readBlobAsDataUrl) {
			window.readBlobAsDataUrl(file, handleDataUrlReady);
			return;
		}

		var reader = new FileReader();
		reader.onload = function(e) {
			handleDataUrlReady(null, e.target.result);
		};
		reader.onerror = function() {
			handleDataUrlReady(new Error('读取图像失败'), null);
		};
		reader.readAsDataURL(file);
	}

	processNextDecodeImage(0);
}

function showPwdDecode() {
	if (imagePwdDecode.type === 'password') {
		imagePwdDecode.type = 'text';
		showKeyDecode.src = eyeImg.replace('eye', 'eye-off');
	} else {
		imagePwdDecode.type = 'password';
		showKeyDecode.src = eyeImg;
	}
}

// 切换按钮状态（普通模式/载体库模式）
function toggleCoverImageButton(carrierLibraryMode) {
	var coverImageBtn = document.getElementById('coverImageBtn');
	var coverImageLabel = document.getElementById('coverImageLabel');
	var imageFileInput = document.getElementById('imageFile');
	var fixCoverImageBtn = document.getElementById('fixCoverImageBtn');
	
	if (!coverImageBtn) return;
	
	if (carrierLibraryMode) {
		// 载体库模式
		coverImageBtn.textContent = '载体库';
		coverImageBtn.classList.add('carrier-library-mode');
		// 禁用原来的文件输入
		if (imageFileInput) {
			imageFileInput.disabled = true;
		}
		// 确保加载封面图按钮可用
		if (coverImageBtn) {
			coverImageBtn.disabled = false;
			coverImageBtn.style.opacity = '1';
			coverImageBtn.style.cursor = 'pointer';
			coverImageBtn.style.pointerEvents = 'auto';
		}
		if (coverImageLabel) {
			coverImageLabel.style.pointerEvents = 'auto';
			coverImageLabel.style.opacity = '1';
			coverImageLabel.style.cursor = 'pointer';
		}
		// 固定封面图功能暂时失效（移除彩虹渐变）
		if (fixCoverImageBtn && fixCoverImageBtn.classList.contains('fixed-cover-mode')) {
			fixCoverImageBtn.classList.remove('fixed-cover-mode');
			fixCoverImageBtn.dataset.wasFixed = 'true'; // 标记之前是固定状态
		}
		// 清除预览区域的固定封面图
		var previewContainer = document.getElementById('previewContainer');
		var preview = document.getElementById('preview');
		var previewFilename = document.getElementById('previewFilename');
		if (previewContainer) previewContainer.style.display = 'none';
		if (preview) preview.src = '';
		if (previewFilename) previewFilename.textContent = '';
	} else {
		// 普通模式
		coverImageBtn.textContent = '加载封面图像';
		coverImageBtn.classList.remove('carrier-library-mode');
		// 启用原来的文件输入
		if (imageFileInput) {
			imageFileInput.disabled = false;
		}
		// 恢复固定封面图状态
		if (fixCoverImageBtn && fixCoverImageBtn.dataset.wasFixed === 'true') {
			fixCoverImageBtn.classList.add('fixed-cover-mode');
			delete fixCoverImageBtn.dataset.wasFixed;
			// 重新加载固定封面图
			if (window.reloadFixedCoverImage) {
				window.reloadFixedCoverImage();
			}
			// 检查是否有固定封面图数据，如果有则禁用加载封面图按钮
			if (window.isFixedCoverImageActive && window.isFixedCoverImageActive()) {
				if (coverImageBtn) {
					coverImageBtn.disabled = true;
					coverImageBtn.style.opacity = '0.45';
					coverImageBtn.style.cursor = 'not-allowed';
					coverImageBtn.style.pointerEvents = 'none';
				}
				if (coverImageLabel) {
					coverImageLabel.style.pointerEvents = 'none';
					coverImageLabel.style.opacity = '0.45';
					coverImageLabel.style.cursor = 'not-allowed';
				}
			}
		}
	}
}

// 载体库相关事件监听器
window.addEventListener('load', function() {
	// 载体库文件输入
	var carrierLibraryFile = document.getElementById('carrierLibraryFile');
	if (carrierLibraryFile) {
		carrierLibraryFile.addEventListener('change', function() {
			if (this.files && this.files.length > 0 && window.handleCarrierLibraryFiles) {
				window.handleCarrierLibraryFiles(this.files);
			}
			this.value = '';
		});
	}
	
	// 清空载体库按钮
	var carrierLibraryClearBtn = document.getElementById('carrierLibraryClearBtn');
	if (carrierLibraryClearBtn) {
		carrierLibraryClearBtn.addEventListener('click', function() {
			if (window.clearCarrierLibrary) {
				window.clearCarrierLibrary();
			}
		});
	}
	
	// 载体库弹窗关闭按钮
	var carrierLibraryModalClose = document.getElementById('carrierLibraryModalClose');
	if (carrierLibraryModalClose) {
		carrierLibraryModalClose.addEventListener('click', function() {
			if (window.closeCarrierLibraryModal) {
				window.closeCarrierLibraryModal();
			}
		});
	}
	
	// 点击弹窗外部关闭
	var carrierLibraryModal = document.getElementById('carrierLibraryModal');
	if (carrierLibraryModal) {
		carrierLibraryModal.addEventListener('click', function(e) {
			if (e.target === carrierLibraryModal && window.closeCarrierLibraryModal) {
				window.closeCarrierLibraryModal();
			}
		});
	}
	
	// 封面图像按钮点击事件
	var coverImageLabel = document.getElementById('coverImageLabel');
	if (coverImageLabel) {
		coverImageLabel.addEventListener('click', function(e) {
			// 检查是否在载体库模式
			if (window.isCarrierLibraryModeEnabled && window.isCarrierLibraryModeEnabled()) {
				e.preventDefault();
				if (window.openCarrierLibraryModal) {
					window.openCarrierLibraryModal();
				}
			}
		});
	}
	
	// 初始化按钮状态 - 延迟执行，确保DOM完全加载
	setTimeout(function() {
		if (window.isCarrierLibraryModeEnabled) {
			toggleCoverImageButton(window.isCarrierLibraryModeEnabled());
		}
	}, 100);
});

// 暴露 toggleCoverImageButton 到全局作用域
window.toggleCoverImageButton = toggleCoverImageButton;

// 法律声明弹窗功能
window.addEventListener('load', function() {
	function openLegalModal(modalId) {
		var modal = document.getElementById(modalId);
		if (modal) {
			modal.style.display = 'flex';
			document.body.style.overflow = 'hidden';
		}
	}
	
	function closeLegalModal(modal) {
		if (modal) {
			modal.style.display = 'none';
			document.body.style.overflow = '';
		}
	}
	
	var disclaimerLink = document.getElementById('disclaimerLink');
	var userAgreementLink = document.getElementById('userAgreementLink');
	var copyrightLink = document.getElementById('copyrightLink');
	var wenshushuInfoBtn = document.getElementById('wenshushuInfoBtn');
	
	if (disclaimerLink) {
		disclaimerLink.addEventListener('click', function() {
			openLegalModal('disclaimerModal');
		});
	}
	
	if (userAgreementLink) {
		userAgreementLink.addEventListener('click', function() {
			openLegalModal('userAgreementModal');
		});
	}
	
	if (copyrightLink) {
		copyrightLink.addEventListener('click', function() {
			openLegalModal('copyrightModal');
		});
	}

	if (wenshushuInfoBtn) {
		wenshushuInfoBtn.addEventListener('click', function() {
			openLegalModal('wenshushuModal');
		});
	}

	var stegoMethodBtn = document.getElementById('stegoMethodBtn');
	var noticeBtn = document.getElementById('noticeBtn');
	
	if (stegoMethodBtn) {
		stegoMethodBtn.addEventListener('click', function() {
			openLegalModal('stegoMethodModal');
		});
	}
	
	if (noticeBtn) {
		noticeBtn.addEventListener('click', function() {
			openLegalModal('noticeModal');
		});
	}
	
	var legalModals = document.querySelectorAll('.legal-modal');
	legalModals.forEach(function(modal) {
		var closeBtn = modal.querySelector('.legal-modal-close');
		if (closeBtn) {
			closeBtn.addEventListener('click', function() {
				closeLegalModal(modal);
			});
		}
		
		modal.addEventListener('click', function(e) {
			if (e.target === modal) {
				closeLegalModal(modal);
			}
		});
	});
	
	document.addEventListener('keydown', function(e) {
		if (e.key === 'Escape') {
			legalModals.forEach(function(modal) {
				if (modal.style.display === 'flex') {
					closeLegalModal(modal);
				}
			});
		}
	});
});
