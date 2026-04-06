// 简化的文件尾追加函数（使用可靠的旧格式）- 带进度条和异步处理
function appendToFileTail(){    
    // 收集内容
    var combinedContent = getCombinedContent();
    
    // 显示进度条
    showProgressBar('正在准备数据...');
    updateProgress(0, '检查内容...');
    
    // 检查是否有内容需要隐藏
    if(!combinedContent || combinedContent.trim() === ''){        
        hideProgressBar();
        imageMsg.textContent = '没有要隐藏的内容';
        throw("box empty of content");
    }
    if(!originalCoverFile && preview.src.length < 100){                                                                             
        hideProgressBar();
        imageMsg.textContent = '请在点击此按钮前加载图像';
        throw("no image loaded");
    }
    
    // 使用异步处理，避免UI冻结
    setTimeout(function() {
        try {
            updateProgress(10, '处理二进制文件数据...');
            
            // 处理二进制文件数据（文件尾追加模式下的图片和文件）
            // 性能优化：使用数组收集 HTML 片段，避免字符串拼接的 O(n²) 复杂度
            var binaryContentParts = [];
            if(binaryFilesForTail && binaryFilesForTail.length > 0) {
                var totalFiles = binaryFilesForTail.length;
                binaryFilesForTail.forEach(function(fileData, index) {
                    var fileProgress = 10 + (index / totalFiles) * 30;
                    updateProgress(fileProgress, '处理文件: ' + fileData.name + ' (' + (index + 1) + '/' + totalFiles + ')');
                    
                    // 将 ArrayBuffer 转换为 Base64 - 使用优化的分块处理
                    var bytes = new Uint8Array(fileData.data);
                    var chunks = [];
                    var chunkSize = 8192; // 8KB chunks
                    
                    for(var i = 0; i < bytes.byteLength; i += chunkSize) {
                        var chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.byteLength));
                        chunks.push(String.fromCharCode.apply(null, chunk));
                    }
                    
                    var base64 = btoa(chunks.join(''));
                    var mimeType = fileData.type || 'application/octet-stream';
                    var dataUrl = 'data:' + mimeType + ';base64,' + base64;
                    
                    // 根据文件类型生成不同的 HTML - 使用数组收集
                    if(mimeType.startsWith('image/')) {
                        binaryContentParts.push('<div class="image-list-item"><img src="' + dataUrl + '" data-filename="' + fileData.name + '"><span class="image-filename">' + fileData.name + '</span></div>');
                    } else {
                        binaryContentParts.push('<div class="file-list-item"><a download="' + fileData.name + '" href="' + dataUrl + '"><span class="file-icon">📄</span> ' + fileData.name + '</a></div>');
                    }
                });
            }
            
            // 一次性合并所有 HTML 片段
            var binaryContent = binaryContentParts.join('');
            
            // 合并二进制内容和其他内容
            if(binaryContent) {
                combinedContent = '<div class="stego-image-section">' + binaryContent + '</div>' + combinedContent;
            }
            
            updateProgress(50, '压缩数据...');
            
            // 设置编码进行中的标志位，防止updateCapacity被触发
            isEncodingInProgress = true;
            
            var pwdArray = imagePwd.value.split('|');
            var password = pwdArray[0];
            
            // 如果用户未输入密码，使用固定高强度密码
            if(!password || password.trim() === '') {
                password = DEFAULT_HIGH_STRENGTH_PASSWORD;
            }
            
            // 压缩内容 - 使用分块压缩避免大文件错误
            setTimeout(function() {
                try {
                    var compressedData = compressLargeData(combinedContent);
                    
                    updateProgress(70, '准备追加数据...');
                    
                    // 准备要追加的数据
                    var marker = "PASSLOK_STEGO_TAIL";
                    var dataToAppend;
                    if(password) {
                        dataToAppend = marker + password + '|' + compressedData + marker;
                    } else {
                        dataToAppend = marker + compressedData + marker;
                    }
                    
                    updateProgress(80, '处理图像文件...');
                    
                    // 使用原始文件或从 preview.src 获取
                    var processImage = function() {
                        if (originalCoverFile) {
                            var reader = new FileReader();
                            reader.onload = function(e) {
                                updateProgress(90, '追加数据到图像...');
                                var arrayBuffer = e.target.result;
                                var contentType = originalCoverFile.type || 'image/png';
                                processImageData(arrayBuffer, contentType, dataToAppend);
                            };
                            reader.readAsArrayBuffer(originalCoverFile);
                        } else {
                            // 从 preview.src 获取图像数据
                            fetch(preview.src)
                                .then(response => {
                                    var contentType = response.headers.get('content-type');
                                    return response.blob().then(blob => ({ blob, contentType }));
                                })
                                .then(({ blob, contentType }) => {
                                    updateProgress(90, '追加数据到图像...');
                                    return blob.arrayBuffer().then(arrayBuffer => ({ arrayBuffer, contentType }));
                                })
                                .then(({ arrayBuffer, contentType }) => {
                                    processImageData(arrayBuffer, contentType, dataToAppend);
                                })
                                .catch(error => {
                                    console.error('Error appending data:', error);
                                    hideProgressBar();
                                    imageMsg.textContent = '追加数据时出错: ' + error.message;
                                });
                        }
                    };
                    
                    processImage();
                } catch (error) {
                    hideProgressBar();
                    imageMsg.textContent = '压缩数据时出错: ' + error.message;
                    console.error('Compression error:', error);
                }
            }, 10); // 10ms 延迟，让UI有机会更新
            
        } catch (error) {
            hideProgressBar();
            imageMsg.textContent = '处理数据时出错: ' + error.message;
            console.error('Processing error:', error);
        }
    }, 10); // 10ms 延迟，让UI有机会更新
    
    // 处理图像数据的核心函数
    function processImageData(arrayBuffer, contentType, dataToAppend) {
        var textEncoder = new TextEncoder();
        var dataBytes = textEncoder.encode(dataToAppend);
        
        // 创建新的 ArrayBuffer
        var newBuffer = new ArrayBuffer(arrayBuffer.byteLength + dataBytes.length);
        var newUint8Array = new Uint8Array(newBuffer);
        
        // 复制原始图像
        newUint8Array.set(new Uint8Array(arrayBuffer), 0);
        
        // 追加数据
        newUint8Array.set(dataBytes, arrayBuffer.byteLength);
        
        // 创建新的 blob
        var newBlob = new Blob([newUint8Array], {type: contentType});
        var newUrl = URL.createObjectURL(newBlob);
        
        // 更新预览
        preview.src = newUrl;
        
        // 存储下载数据
        processedImageData = newUrl;
        processedImageFilename = 'stego-image-tail.' + (contentType.includes('png') ? 'png' : 'jpg');
        
        // 启用下载
        enableDownload();
        
        // 隐藏进度条并显示成功消息
        hideProgressBar();
        imageMsg.textContent = '数据已追加到图像文件尾。点击下载按钮保存图像。';
        
        // 设置冷却时间
        encodingCompleteCooldown = Date.now() + 10000;
        
        // 清除编码标志位
        setTimeout(function() {
            isEncodingInProgress = false;
        }, 2000);
        
        // 清理
        imagePwd.value = '';
        binaryFilesForTail = [];
        textForTail = '';
    }
}
