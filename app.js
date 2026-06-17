/**
 * app.js
 * 主应用逻辑和事件处理
 */

const App = {
    state: {
        currentTrade: null,
        currentPrices: {},
        currentStockInfo: null,
        isLoading: false
    },

    // ========== 初始化 ==========
    init() {
        this.setupEventListeners();
        this.renderFeedbackProductsTable();
        this.showMessage('应用已加载', 'success');
    },
    
    /**
     * 渲染成交反馈的产品表格
     */
    renderFeedbackProductsTable() {
        const container = document.getElementById('feedbackProductsTable');
        const products = Storage.getProducts();
        
        container.innerHTML = products.map(product => `
            <div class="feedback-product-row">
                <div class="feedback-product-name">${product.name}</div>
                <div class="feedback-product-assets">净资产: ¥${product.netAssets.toLocaleString('zh-CN', {maximumFractionDigits: 2})}</div>
                <div class="feedback-product-input">
                    <input type="number" id="feedback_price_${product.id}" class="form-control" placeholder="成交价" step="0.01" min="0">
                </div>
                <div class="feedback-product-input">
                    <input type="number" id="feedback_mv_${product.id}" class="form-control" placeholder="市值（万元）" step="0.01" min="0">
                </div>
            </div>
        `).join('');
    },

    /**
     * 设置事件监听器
     */
    setupEventListeners() {
        // 指令输入区事件
        document.getElementById('parseBtn').addEventListener('click', () => this.handleParse());
        document.getElementById('clearBtn').addEventListener('click', () => this.handleClear());
        document.getElementById('refreshBtn').addEventListener('click', () => this.handleRefresh());

        // 产品管理事件
        document.getElementById('productMgmtBtn').addEventListener('click', () => this.openProductModal());
        document.getElementById('closeProductModal').addEventListener('click', () => this.closeProductModal());
        document.getElementById('closeProductModalBtn').addEventListener('click', () => this.closeProductModal());
        document.getElementById('addProductBtn').addEventListener('click', () => this.handleAddProduct());
        document.getElementById('exportProductsBtn').addEventListener('click', () => this.handleExportProducts());
        document.getElementById('importProductsBtn').addEventListener('click', () => this.handleImportProducts());
        document.getElementById('importFile').addEventListener('change', (e) => this.handleFileImport(e));

        // 导出结果事件
        document.getElementById('exportBtn').addEventListener('click', () => this.handleExportTrade());

        // 成交反馈事件
        document.getElementById('calculateFeedbackBtn').addEventListener('click', () => this.handleCalculateFeedback());
        document.getElementById('copyFeedbackBtn').addEventListener('click', () => this.handleCopyFeedback());
        document.getElementById('clearFeedbackBtn').addEventListener('click', () => this.handleClearFeedback());

        // 回车快捷键
        document.getElementById('instructionInput').addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                this.handleParse();
            }
        });

        // 点击模态框外关闭
        document.getElementById('productModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('productModal')) {
                this.closeProductModal();
            }
        });
    },

    // ========== 指令解析处理 ==========

    /**
     * 处理指令解析
     */
    async handleParse() {
        const instruction = document.getElementById('instructionInput').value;
        
        if (!instruction.trim()) {
            this.showMessage('请输入指令', 'warning');
            return;
        }

        this.state.isLoading = true;
        this.showMessage('正在处理指令...', 'info');

        try {
            // 获取产品列表
            const products = Storage.getProducts();

            // 解析指令
            const parseResult = Parser.parse(instruction, products);
            const validation = Parser.validate(parseResult);

            if (!validation.valid) {
                this.showMessage(validation.error, 'error');
                this.state.isLoading = false;
                return;
            }

            // 检查是否识别到股票名称
            if (!parseResult.targetStockName) {
                this.showMessage('未能识别目标股票名称，请检查指令格式', 'warning');
                this.state.isLoading = false;
                return;
            }

            // 搜索股票获取信息
            this.showMessage('正在搜索股票...', 'info');
            let stockInfo = await API.searchStock(parseResult.targetStockName);
            
            if (!stockInfo) {
                this.showMessage(`未找到股票"${parseResult.targetStockName}"`, 'error');
                this.state.isLoading = false;
                return;
            }

            // 如果搜索结果没有价格，单独获取实时价格
            if (!stockInfo.price || stockInfo.price === 0) {
                this.showMessage('正在获取实时价格...', 'info');
                // 使用腾讯API重新获取价格
                try {
                    const price = await API._fetchPriceFromTencent(stockInfo.code);
                    if (price && price > 0) {
                        stockInfo.price = price;
                    }
                } catch (e) {
                    console.warn('获取实时价格失败:', e);
                }
            }

            this.state.currentStockInfo = stockInfo;
            this.state.currentPrices = { [stockInfo.code]: stockInfo.price };

            // 保存当前交易信息
            this.state.currentTrade = {
                parseResult,
                products,
                stockInfo,
                prices: this.state.currentPrices,
                timestamp: new Date().toISOString()
            };

            // 根据指令类型生成不同结果
            if (parseResult.type === 'info_only') {
                // 只显示股票信息，不计算百分比和股数
                this.renderStockInfoOnly(stockInfo);
            } else {
                // 生成完整结果表格
                this.renderResultsTable(parseResult, products, stockInfo);
            }

            // 更新成交反馈区域的股票信息
            this.updateFeedbackStockInfo(stockInfo);

            this.showMessage('指令解析成功', 'success');

        } catch (error) {
            console.error('处理指令出错:', error);
            this.showMessage('处理指令失败: ' + error.message, 'error');
        } finally {
            this.state.isLoading = false;
        }
    },

    /**
     * 更新成交反馈区域的股票信息
     */
    updateFeedbackStockInfo(stockInfo) {
        const infoDiv = document.getElementById('feedbackStockInfo');
        infoDiv.innerHTML = `
            <div class="stock-info-item"><strong>${stockInfo.name}</strong></div>
            <div class="stock-info-item">代码: ${stockInfo.code}</div>
            <div class="stock-info-item">平台: ${stockInfo.platform}</div>
            <div class="stock-info-item">现价: ¥${stockInfo.price.toFixed(2)}</div>
        `;
        infoDiv.style.display = 'flex';
    },

    /**
     * 生成结果表格 - 新布局
     * 表头：平台、证券代码、证券名称、现价、百分比、各产品股数
     */
    renderResultsTable(parseResult, products, stockInfo) {
        const tbody = document.getElementById('resultsTableBody');
        tbody.innerHTML = '';

        const selectedProducts = products.filter(p => parseResult.selectedProducts.includes(p.id));
        const price = stockInfo.price;
        const platform = stockInfo.platform || API.getPlatform(stockInfo.code);

        // 计算每个产品的股数
        const productQuantities = {};
        selectedProducts.forEach(product => {
            const quantity = this.calculateQuantity(parseResult.points, product.netAssets, price);
            productQuantities[product.id] = quantity;
        });

        // 计算百分比（使用第一个产品的百分比作为参考，因为价格相同）
        const firstProduct = selectedProducts[0];
        const firstQuantity = productQuantities[firstProduct.id] || 0;
        const referencePercentage = this.calculatePercentage(firstQuantity, price, firstProduct.netAssets);

        // 创建表头
        const thead = document.getElementById('resultsTableHead');
        thead.innerHTML = `
            <tr>
                <th>平台</th>
                <th>证券代码</th>
                <th>证券名称</th>
                <th>现价(¥)</th>
                <th>百分比(%)</th>
                ${selectedProducts.map(p => `<th>${p.name}(股)</th>`).join('')}
            </tr>
        `;

        // 创建数据行
        const row = document.createElement('tr');
        row.className = parseResult.direction === 'buy' ? 'buy-row' : 'sell-row';
        
        const priceClass = parseResult.direction === 'buy' ? 'buy-price' : 'sell-price';

        // 格式化证券代码：英文字母+数字格式只显示数字部分
        const displayCode = this._formatStockCode(stockInfo.code);

        let cellsHtml = `
            <td>${platform}</td>
            <td><code style="cursor:pointer" onclick="App.copyToClipboard('${displayCode}')" title="点击复制">${displayCode}</code></td>
            <td>${stockInfo.name}</td>
            <td class="${priceClass}">¥${price.toFixed(2)}</td>
            <td>${referencePercentage.toFixed(2)}%</td>
        `;

        // 添加每个产品的股数
        selectedProducts.forEach(product => {
            const quantity = productQuantities[product.id];
            const pct = this.calculatePercentage(quantity, price, product.netAssets);
            cellsHtml += `<td><strong style="cursor:pointer" onclick="App.copyToClipboard('${quantity}')" title="点击复制">${quantity}</strong><br><small class="pct">${pct.toFixed(2)}%</small></td>`;
        });

        row.innerHTML = cellsHtml;
        tbody.appendChild(row);

        // 保存当前数据用于复制
        this.state.currentResultData = {
            parseResult,
            products: selectedProducts,
            stockInfo,
            productQuantities,
            price,
            platform
        };
    },

    /**
     * 复制结果
     */
    copyResult() {
        if (!this.state.currentResultData) return;
        
        const { parseResult, products, stockInfo, productQuantities, price } = this.state.currentResultData;
        const direction = parseResult.direction === 'buy' ? '买入' : '卖出';
        
        let text = `${stockInfo.name}${direction}\n`;
        products.forEach(product => {
            const quantity = productQuantities[product.id];
            const pct = this.calculatePercentage(quantity, price, product.netAssets);
            text += `${product.name} ${price.toFixed(2)} ${pct.toFixed(2)}%\n`;
        });
        
        navigator.clipboard.writeText(text.trim()).then(() => {
            this.showMessage('已复制到剪贴板', 'success');
        }).catch(() => {
            this.showMessage('复制失败', 'error');
        });
    },

    /**
     * 渲染只含股票信息的表格（用于"全卖"等不计算股数的指令）
     */
    renderStockInfoOnly(stockInfo) {
        const thead = document.getElementById('resultsTableHead');
        thead.innerHTML = `
            <tr>
                <th>平台</th>
                <th>证券代码</th>
                <th>证券名称</th>
                <th>现价(¥)</th>
            </tr>
        `;

        const tbody = document.getElementById('resultsTableBody');
        const platform = stockInfo.platform || API.getPlatform(stockInfo.code);
        const displayCode = this._formatStockCode(stockInfo.code);
        tbody.innerHTML = `
            <tr class="sell-row">
                <td>${platform}</td>
                <td><code style="cursor:pointer" onclick="App.copyToClipboard('${displayCode}')" title="点击复制">${displayCode}</code></td>
                <td>${stockInfo.name}</td>
                <td class="sell-price">¥${stockInfo.price.toFixed(2)}</td>
            </tr>
        `;

        // 保存当前数据用于复制
        this.state.currentResultData = {
            parseResult: { type: 'info_only' },
            stockInfo,
            price: stockInfo.price,
            platform
        };
    },

    /**
     * 计算应买卖股数
     * 公式：股数 = (点数 × 产品净资产 × 0.01) / 现价 → 四舍五入到百位
     */
    calculateQuantity(points, netAssets, price) {
        if (price === 0) return 0;
        const quantity = (points * netAssets * 0.01) / price;
        // 四舍五入到百位
        return Math.round(quantity / 100) * 100;
    },

    /**
     * 计算百分比
     * 公式：百分比 = (股数 × 现价) / 产品净资产 × 100%
     */
    calculatePercentage(quantity, price, netAssets) {
        if (netAssets === 0) return 0;
        return (quantity * price / netAssets) * 100;
    },

    /**
     * 处理清空指令
     */
    handleClear() {
        document.getElementById('instructionInput').value = '';
        document.getElementById('resultsTableHead').innerHTML = `
            <tr>
                <th>平台</th>
                <th>证券代码</th>
                <th>证券名称</th>
                <th>现价(¥)</th>
                <th>百分比(%)</th>
            </tr>
        `;
        document.getElementById('resultsTableBody').innerHTML = `
            <tr class="empty-row">
                <td colspan="5">请输入指令后点击"解析指令"</td>
            </tr>
        `;
        this.state.currentTrade = null;
        this.state.currentResultData = null;
        this.state.currentStockInfo = null;
        
        // 清空成交反馈区域的股票信息
        document.getElementById('feedbackStockInfo').style.display = 'none';
        document.getElementById('feedbackResult').style.display = 'none';
    },

    /**
     * 处理刷新价格
     */
    async handleRefresh() {
        if (!this.state.currentTrade) {
            this.showMessage('请先解析一条指令', 'warning');
            return;
        }

        this.state.isLoading = true;
        this.showMessage('正在刷新价格...', 'info');

        try {
            // 清除缓存强制刷新
            API.clearCache();

            // 重新获取股票信息
            const stockInfo = await API.searchStock(this.state.currentTrade.stockInfo.name);
            if (!stockInfo) {
                this.showMessage('刷新价格失败', 'error');
                return;
            }

            this.state.currentStockInfo = stockInfo;
            this.state.currentPrices = { [stockInfo.code]: stockInfo.price };
            this.state.currentTrade.stockInfo = stockInfo;
            this.state.currentTrade.prices = this.state.currentPrices;

            // 重新渲染表格
            this.renderResultsTable(
                this.state.currentTrade.parseResult,
                this.state.currentTrade.products,
                stockInfo
            );

            // 更新成交反馈区域的股票信息
            this.updateFeedbackStockInfo(stockInfo);

            this.showMessage('价格已刷新', 'success');

        } catch (error) {
            console.error('刷新价格出错:', error);
            this.showMessage('刷新价格失败: ' + error.message, 'error');
        } finally {
            this.state.isLoading = false;
        }
    },

    // ========== 产品管理 ==========

    /**
     * 打开产品管理弹层
     */
    openProductModal() {
        document.getElementById('productModal').style.display = 'flex';
        this.renderProductList();
    },

    /**
     * 关闭产品管理弹层
     */
    closeProductModal() {
        document.getElementById('productModal').style.display = 'none';
    },

    /**
     * 渲染产品列表
     */
    renderProductList() {
        const products = Storage.getProducts();
        const container = document.getElementById('productList');
        container.innerHTML = '';

        products.forEach(product => {
            const div = document.createElement('div');
            div.className = 'product-item';
            div.innerHTML = `
                <div class="product-field">
                    <label>产品名称</label>
                    <input type="text" value="${product.name}" 
                           onchange="App.handleEditProductField('${product.id}', 'name', this.value)">
                </div>
                <div class="product-field">
                    <label>净资产(¥)</label>
                    <input type="number" value="${product.netAssets}" step="0.01"
                           onchange="App.handleEditProductField('${product.id}', 'netAssets', parseFloat(this.value))">
                </div>
                <div class="product-actions">
                    <button class="btn btn-danger btn-sm action-btn" 
                            onclick="App.handleDeleteProduct('${product.id}')">删除</button>
                </div>
            `;
            container.appendChild(div);
        });
    },

    /**
     * 处理编辑产品字段
     */
    handleEditProductField(productId, field, value) {
        const updates = {};
        updates[field] = value;
        Storage.updateProduct(productId, updates);
        // 刷新反馈产品表格
        this.renderFeedbackProductsTable();
        this.showMessage('产品已更新', 'success');
    },

    /**
     * 处理添加产品
     */
    handleAddProduct() {
        const name = document.getElementById('newProductName').value.trim();
        const assets = parseFloat(document.getElementById('newProductAssets').value);

        if (!name || isNaN(assets) || assets < 0) {
            this.showMessage('请正确填写产品信息', 'error');
            return;
        }

        const success = Storage.addProduct({
            name,
            netAssets: assets
        });

        if (success) {
            document.getElementById('newProductName').value = '';
            document.getElementById('newProductAssets').value = '';
            this.renderProductList();
            this.renderFeedbackProductsTable();
            this.showMessage('产品添加成功', 'success');
        } else {
            this.showMessage('产品添加失败', 'error');
        }
    },

    /**
     * 处理删除产品
     */
    handleDeleteProduct(productId) {
        const product = Storage.getProducts().find(p => p.id === productId);
        if (!product) return;

        if (confirm(`确认删除产品 "${product.name}" 吗？`)) {
            Storage.deleteProduct(productId);
            this.renderProductList();
            this.renderFeedbackProductsTable();
            this.showMessage('产品已删除', 'success');
        }
    },

    /**
     * 处理导出产品配置
     */
    handleExportProducts() {
        const json = Storage.exportProducts();
        this.downloadJSON('products-config.json', json);
        this.showMessage('产品配置已导出', 'success');
    },

    /**
     * 处理导入产品配置
     */
    handleImportProducts() {
        document.getElementById('importFile').click();
    },

    /**
     * 处理文件导入
     */
    handleFileImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target.result;
                if (Storage.importProducts(content)) {
                    this.renderProductList();
                    this.renderFeedbackProductsTable();
                    this.showMessage('产品配置导入成功', 'success');
                } else {
                    this.showMessage('产品配置导入失败', 'error');
                }
            } catch (error) {
                this.showMessage('文件解析失败: ' + error.message, 'error');
            }
        };
        reader.readAsText(file);

        // 重置input，以便重复选择同一文件
        event.target.value = '';
    },

    // ========== 成交反馈 ==========

    /**
     * 处理计算成交反馈 - 直接使用已解析的股票信息
     * 市值可选，如果没有填市值则不显示百分比
     */
    handleCalculateFeedback() {
        if (!this.state.currentStockInfo) {
            this.showMessage('请先解析一条指令', 'warning');
            return;
        }

        const stockInfo = this.state.currentStockInfo;
        const products = Storage.getProducts();
        
        // 获取所有产品的成交价和市值输入
        const feedbackData = [];
        let hasValidPriceInput = false;
        
        products.forEach(product => {
            const priceInput = document.getElementById(`feedback_price_${product.id}`);
            const marketValueInput = document.getElementById(`feedback_mv_${product.id}`);
            
            // 至少需要成交价
            if (priceInput && priceInput.value) {
                const tradePrice = parseFloat(priceInput.value);
                
                if (!isNaN(tradePrice) && tradePrice > 0) {
                    const item = {
                        productName: product.name,
                        price: tradePrice
                    };
                    
                    // 如果填了市值，计算百分比
                    if (marketValueInput && marketValueInput.value) {
                        const marketValue = parseFloat(marketValueInput.value) * 10000;
                        if (!isNaN(marketValue) && marketValue > 0) {
                            item.percentage = (marketValue / product.netAssets) * 100;
                            item.marketValue = marketValue;
                        }
                    }
                    
                    feedbackData.push(item);
                    hasValidPriceInput = true;
                }
            }
        });

        if (!hasValidPriceInput) {
            this.showMessage('请至少输入一个产品的成交价', 'warning');
            return;
        }

        // 生成反馈文本，根据指令方向决定买入或卖出
        const direction = this.state.currentTrade && this.state.currentTrade.parseResult 
            ? this.state.currentTrade.parseResult.direction 
            : 'buy';
        const actionText = direction === 'sell' ? '卖出' : '买入';
        let feedbackText = `${stockInfo.name}${actionText}\n`;
        feedbackData.forEach(item => {
            if (item.percentage !== undefined) {
                feedbackText += `${item.productName} ${item.price.toFixed(2)} ${item.percentage.toFixed(2)}%\n`;
            } else {
                feedbackText += `${item.productName} ${item.price.toFixed(2)}\n`;
            }
        });

        // 保存反馈记录
        Storage.addFeedback({
            stockName: stockInfo.name,
            stockCode: stockInfo.code,
            feedbackData,
            timestamp: new Date().toISOString()
        });

        // 显示结果
        const output = document.getElementById('feedbackOutput');
        output.textContent = feedbackText.trim();
        document.getElementById('feedbackResult').style.display = 'block';

        this.showMessage('反馈数据已计算', 'success');
    },

    /**
     * 处理复制反馈结果
     */
    handleCopyFeedback() {
        const output = document.getElementById('feedbackOutput');
        if (!output.textContent) {
            this.showMessage('没有可复制的内容', 'warning');
            return;
        }

        navigator.clipboard.writeText(output.textContent).then(() => {
            this.showMessage('已复制到剪贴板', 'success');
        }).catch(() => {
            this.showMessage('复制失败', 'error');
        });
    },

    /**
     * 清空成交反馈区域的输入
     */
    handleClearFeedback() {
        const products = Storage.getProducts();
        products.forEach(product => {
            const priceInput = document.getElementById(`feedback_price_${product.id}`);
            const marketValueInput = document.getElementById(`feedback_mv_${product.id}`);
            if (priceInput) priceInput.value = '';
            if (marketValueInput) marketValueInput.value = '';
        });
        // 隐藏反馈结果
        document.getElementById('feedbackResult').style.display = 'none';
        this.showMessage('已清空成交反馈输入', 'success');
    },

    // ========== 导出功能 ==========

    /**
     * 处理导出当前交易结果
     */
    handleExportTrade() {
        if (!this.state.currentTrade) {
            this.showMessage('请先解析一条指令', 'warning');
            return;
        }

        const data = {
            instruction: this.state.currentTrade.parseResult.rawInstruction,
            direction: this.state.currentTrade.parseResult.direction === 'buy' ? '买入' : '卖出',
            points: this.state.currentTrade.parseResult.points,
            stockInfo: this.state.currentTrade.stockInfo,
            timestamp: this.state.currentTrade.timestamp
        };

        this.downloadJSON('trade-result.json', JSON.stringify(data, null, 2));
        this.showMessage('交易结果已导出', 'success');
    },

    /**
     * 下载JSON文件
     */
    downloadJSON(filename, content) {
        const element = document.createElement('a');
        element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
        element.setAttribute('download', filename);
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    },

    // ========== 辅助方法 ==========

    /**
     * 格式化证券代码：英文字母+数字格式只显示数字部分
     * 如 "sh600000" -> "600000"，纯数字则原样返回
     */
    _formatStockCode(code) {
        const match = code.match(/^[a-zA-Z]+(\d+)$/);
        return match ? match[1] : code;
    },

    /**
     * 复制文本到剪贴板
     */
    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            this.showMessage('已复制: ' + text, 'success');
        }).catch(() => {
            this.showMessage('复制失败', 'error');
        });
    },

    // ========== 消息提示 ==========

    /**
     * 显示消息提示
     */
    showMessage(text, type = 'info') {
        const messageBox = document.getElementById('messageBox');
        
        const message = document.createElement('div');
        message.className = `message ${type}`;
        message.textContent = text;

        messageBox.appendChild(message);

        // 3秒后自动删除
        setTimeout(() => {
            message.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => message.remove(), 300);
        }, 3000);
    }
};

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
