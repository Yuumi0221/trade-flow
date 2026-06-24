/**
 * api.js
 * 股票行情数据API获取模块
 * 使用东方财富API获取实时股票价格
 */

// 股票代码前缀对应平台
const PlatformMap = {
    'sh': '沪A',
    'sz': '深A',
    'hk': '港股',
    'us': '美股',
    'bj': '北A'
};

const API = {
    // 东方财富实时行情API - 获取价格（新接口）
    EASTMONEY_REALTIME_API: 'https://push2.eastmoney.com/api/qt/ulist.np/get?fields=f14,f12,f2&secids=',
    
    // 东方财富搜索API - 获取代码
    EASTMONEY_SEARCH_API: 'https://searchapi.eastmoney.com/api/suggest/get?input=%E5%A4%96%E9%98%B2&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&markettype=&mktnum=&jys=&classify=&securitytype=&status=&count=5',
    
    // 腾讯行情API
    TENCENT_API: 'https://qt.gtimg.cn/q=',
    
    // 新浪行情API
    SINA_API: 'https://hq.sinajs.cn/list=',

    /**
     * 根据股票代码获取平台名称
     * @param {string} code - 股票代码，如 sh600000 或 600000
     * @returns {string} - 平台名称
     */
    getPlatform(code) {
        if (!code) return '未知';
        
        // 如果是纯数字代码
        if (/^\d+$/.test(code)) {
            if (code.startsWith('6') || code.startsWith('1') || code.startsWith('5')) return '沪A';
            if (code.startsWith('0') || code.startsWith('3')) return '深A';
            if (code.startsWith('4') || code.startsWith('8')) return '北A';
            return '未知';
        }
        
        // 如果是标准格式
        const prefix = code.substring(0, 2).toLowerCase();
        return PlatformMap[prefix] || '其他';
    },
    
    /**
     * 标准化股票代码格式
     * @param {string} code - 原始代码
     * @returns {string} - 标准化代码如 sh600000
     */
    normalizeCode(code) {
        if (!code) return '';
        code = code.toString();
        
        // 如果已经是标准格式
        if (code.startsWith('sh') || code.startsWith('sz') || code.startsWith('hk') || code.startsWith('bj')) {
            return code.toLowerCase();
        }
        
        // 根据代码首位判断
        if (code.startsWith('6') || code.startsWith('1') || code.startsWith('5')) {
            return 'sh' + code;
        }
        if (code.startsWith('0') || code.startsWith('3')) {
            return 'sz' + code;
        }
        if (code.startsWith('4') || code.startsWith('8')) {
            return 'bj' + code;
        }
        
        return code.toLowerCase();
    },

    /**
     * 获取东方财富市场代码
     * @param {string} code - 股票代码，如 sh600000 或 600000
     * @returns {string} - 东方财富格式如 1.600000 (1=上海, 0=深圳, 116=港股)
     */
    getEastmoneySecId(code) {
        if (!code) return '';
        
        // 检查是否有前缀
        const prefix = code.substring(0, 2).toLowerCase();
        const pureCode = code.replace(/^(sh|sz|bj|hk)/i, '');
        
        // 港股市场代码为 116
        if (prefix === 'hk') {
            return '116.' + pureCode;
        }
        
        // 判断市场
        if (pureCode.startsWith('6') || pureCode.startsWith('1') || pureCode.startsWith('5')) {
            return '1.' + pureCode;
        }
        if (pureCode.startsWith('0') || pureCode.startsWith('3')) {
            return '0.' + pureCode;
        }
        if (pureCode.startsWith('4') || pureCode.startsWith('8')) {
            return '8.' + pureCode;
        }
        
        return '0.' + pureCode;
    },

    /**
     * 使用JSONP方式调用API（解决CORS问题）
     * @param {string} url - API URL
     * @returns {Promise<Object>} - 返回数据
     */
    jsonpRequest(url) {
        return new Promise((resolve, reject) => {
            const callbackName = 'jsonp_callback_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            // 检查URL是否已经有cb参数
            const separator = url.includes('?') ? '&' : '?';
            const jsonpUrl = url + separator + 'cb=' + callbackName;
            
            const script = document.createElement('script');
            script.src = jsonpUrl;
            
            // 设置超时
            const timeout = setTimeout(() => {
                delete window[callbackName];
                if (script.parentNode) script.parentNode.removeChild(script);
                reject(new Error('JSONP request timeout'));
            }, 10000);
            
            // 设置回调函数
            window[callbackName] = (data) => {
                clearTimeout(timeout);
                delete window[callbackName];
                if (script.parentNode) script.parentNode.removeChild(script);
                resolve(data);
            };
            
            script.onerror = () => {
                clearTimeout(timeout);
                delete window[callbackName];
                if (script.parentNode) script.parentNode.removeChild(script);
                reject(new Error('JSONP request failed'));
            };
            
            document.body.appendChild(script);
        });
    },

    /**
     * 搜索股票（通过股票名称获取股票信息）
     * @param {string} stockName - 股票名称
     * @returns {Promise<Object>} - {code, name, price, platform}
     */
    async searchStock(stockName) {
        if (!stockName || !stockName.trim()) {
            return null;
        }
        
        try {
            // 第一步：使用东方财富搜索API获取股票代码和平台信息（使用JSONP）
            const searchUrl = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(stockName)}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&markettype=&mktnum=&jys=&classify=&securitytype=&status=&count=5`;
            
            let searchData;
            try {
                searchData = await this.jsonpRequest(searchUrl);
            } catch (e) {
                console.warn('JSONP请求失败，尝试fetch:', e);
                // 如果JSONP也失败，尝试直接fetch
                try {
                    const searchResponse = await fetch(searchUrl, {
                        headers: {
                            'Referer': 'https://www.eastmoney.com/'
                        }
                    });
                    searchData = await searchResponse.json();
                } catch (fetchError) {
                    console.warn('fetch也失败:', fetchError);
                    // 返回模拟数据
                    return this.getMockStockInfo(stockName);
                }
            }
            
            let stockCode = '';      // 如 "603083"
            let stockNameResult = stockName;
            let platform = '未知';
            let exchange = '';       // 交易所代码，如 "HK"、"SH"、"SZ"
            
            if (searchData && searchData.QuotationCodeTable && searchData.QuotationCodeTable.Data && searchData.QuotationCodeTable.Data.length > 0) {
                const result = searchData.QuotationCodeTable.Data[0];
                stockCode = result.Code || '';                // 如 "603083"
                stockNameResult = result.Name || stockName;   // 如 "剑桥科技"
                platform = result.SecurityTypeName || '未知'; // 如 "沪A"、"港股"
                exchange = (result.JYS || '').toUpperCase();  // 如 "HK"、"SH"、"SZ"
            }
            
            // 如果搜索不到代码，返回模拟数据
            if (!stockCode) {
                return this.getMockStockInfo(stockName);
            }
            
            // 根据交易所代码正确标准化股票代码
            let code;
            if (exchange === 'HK') {
                // 港股：使用 hk 前缀
                code = 'hk' + stockCode;
            } else {
                // A股：使用原有的标准化逻辑
                code = this.normalizeCode(stockCode);
            }
            
            // 第二步：使用腾讯行情API获取实时价格（比东方财富实时行情API更稳定）
            let price = 0;
            try {
                price = await this._fetchPriceFromTencent(code);
            } catch (e) {
                console.warn('腾讯API获取价格失败:', e);
            }
            
            // 如果腾讯API获取不到价格，使用模拟数据
            if (!price || price === 0) {
                const mockInfo = this.getMockStockInfo(stockName);
                price = mockInfo.price;
                platform = mockInfo.platform;
            }
            
            return {
                code: code,
                name: stockNameResult,
                price: price,
                platform: platform
            };
            
        } catch (error) {
            console.error('搜索股票失败:', error);
            return this.getMockStockInfo(stockName);
        }
    },
    
    /**
     * 从腾讯行情API获取单只股票实时价格
     * @param {string} code - 标准化股票代码，如 sh600519
     * @returns {Promise<number>} - 价格
     */
    async _fetchPriceFromTencent(code) {
        const url = `https://qt.gtimg.cn/q=${code}`;
        
        // 尝试用fetch获取（需要设置Referer）
        try {
            const response = await fetch(url, {
                headers: {
                    'Referer': 'https://qt.gtimg.cn/'
                }
            });
            const text = await response.text();
            return this._parseTencentPrice(text);
        } catch (e) {
            console.warn('fetch腾讯API失败，尝试JSONP:', e);
            // 如果fetch失败，尝试JSONP方式
            const jsonpUrl = `https://qt.gtimg.cn/q=${code}`;
            const data = await this.jsonpRequest(jsonpUrl);
            // JSONP返回的是字符串，需要处理
            if (typeof data === 'string') {
                return this._parseTencentPrice(data);
            }
            throw new Error('无法获取腾讯行情数据');
        }
    },
    
    /**
     * 解析腾讯行情API返回的单个股票价格
     * 返回格式: v_sh600519="1~贵州茅台~600519~1240.00~..."
     * 第4个字段（索引3）是当前价
     * @param {string} text - API返回的文本
     * @returns {number} - 价格
     */
    _parseTencentPrice(text) {
        if (!text) return 0;
        const match = text.match(/"([^"]+)"/);
        if (match) {
            const fields = match[1].split('~');
            if (fields.length >= 4) {
                const price = parseFloat(fields[3]);
                if (!isNaN(price) && price > 0) {
                    return price;
                }
            }
        }
        return 0;
    },
    /**
     * 获取模拟股票信息（用于演示）
     * 当所有API都失败时作为后备方案
     */
    getMockStockInfo(stockName) {
        // 模拟一些常见股票
        const mockStocks = {
            // 港股
            '腾讯控股': { code: 'hk00700', name: '腾讯控股', price: 380.00 },
            '阿里巴巴': { code: 'hk09988', name: '阿里巴巴', price: 85.50 },
            '美团': { code: 'hk03690', name: '美团', price: 118.00 },
            '小米集团': { code: 'hk01810', name: '小米集团', price: 16.50 },
            '京东': { code: 'hk09618', name: '京东', price: 105.00 },
            '网易': { code: 'hk09999', name: '网易', price: 145.00 },
            '百度': { code: 'hk09888', name: '百度', price: 88.00 },
            '中国移动': { code: 'hk00941', name: '中国移动', price: 72.00 },
            '建设银行': { code: 'hk00939', name: '建设银行', price: 5.80 },
            '工商银行': { code: 'hk01398', name: '工商银行', price: 4.50 },
            '香港交易所': { code: 'hk00388', name: '香港交易所', price: 280.00 },
            '中国平安': { code: 'hk02318', name: '中国平安', price: 48.50 },
            // A股
            '贵州茅台': { code: 'sh600519', name: '贵州茅台', price: 1680.00 },
            '宁德时代': { code: 'sz300750', name: '宁德时代', price: 215.00 },
            '比亚迪': { code: 'sz002594', name: '比亚迪', price: 265.00 },
            '招商银行': { code: 'sh600036', name: '招商银行', price: 35.20 },
            '五粮液': { code: 'sz000858', name: '五粮液', price: 145.00 },
            '美的集团': { code: 'sz000333', name: '美的集团', price: 58.00 }
        };
        
        // 精确匹配
        if (mockStocks[stockName]) {
            const stock = mockStocks[stockName];
            return {
                code: stock.code,
                name: stock.name,
                price: stock.price,
                platform: this.getPlatform(stock.code)
            };
        }
        
        // 模糊匹配
        for (const [key, value] of Object.entries(mockStocks)) {
            if (stockName.includes(key) || key.includes(stockName)) {
                return {
                    code: value.code,
                    name: value.name,
                    price: value.price,
                    platform: this.getPlatform(value.code)
                };
            }
        }
        
        // 如果都没找到，返回通用模拟数据
        return {
            code: 'sh600000',
            name: stockName,
            price: 1000,
            platform: '沪A'
        };
    },

    /**
     * 获取股票价格 - 主方法
     * @param {Array} codes - 股票代码数组，如 ['sh600000', 'sz000001']
     * @returns {Promise<Object>} - {code: price} 格式
     */
    async getPrice(codes) {
        if (!codes || codes.length === 0) {
            return {};
        }

        // 先查检本地缓存
        const { prices, needUpdate } = Storage.getCachedPrice(codes);
        
        if (needUpdate.length === 0) {
            // 所有数据都有有效缓存
            return prices;
        }

        // 需要更新的部分从API获取
        try {
            const newPrices = await this._fetchFromTencent(needUpdate);
            
            // 如果腾讯API失败，尝试新浪API
            if (Object.keys(newPrices).length === 0) {
                return await this._fetchFromSina(needUpdate);
            }

            // 保存新数据到缓存
            Storage.setCachedPrice(newPrices);

            // 合并缓存数据和新数据
            return { ...prices, ...newPrices };
        } catch (error) {
            console.error('获取股票价格失败:', error);
            // 如果API失败，返回现有缓存
            return prices;
        }
    },

    /**
     * 根据股票名称获取股票信息
     */
    async getStockInfoByName(stockName) {
        return await this.searchStock(stockName);
    },

    /**
     * 从腾讯API获取价格
     * 腾讯API支持批量查询，多个代码用逗号分隔
     * 例如: https://qt.gtimg.cn/q=sh600519,hk00700,sz000001
     */
    async _fetchFromTencent(codes) {
        try {
            // 腾讯API批量查询使用逗号分隔，不需要v_前缀
            const queryStr = codes.join(',');
            const url = this.TENCENT_API + queryStr;

            const response = await fetch(url);
            const text = await response.text();

            return this._parseTencentResponse(text, codes);
        } catch (error) {
            console.error('腾讯API调用失败:', error);
            return {};
        }
    },

    /**
     * 解析腾讯API响应
     * 腾讯API返回格式（A股和港股通用）：
     * v_sh600519="1~贵州茅台~600519~1207.68~..."
     * v_hk00700="100~腾讯控股~00700~428.800~..."
     * 第4个字段（索引3）是当前价
     * 注意：字段分隔符是 ~ 不是逗号
     */
    _parseTencentResponse(text, codes) {
        const prices = {};
        
        try {
            const lines = text.split('\n');
            
            lines.forEach((line) => {
                if (!line.trim()) return;
                
                // 提取股票代码：从 v_xxx 格式中提取
                const codeMatch = line.match(/v_([a-z]+\d+)="/);
                if (!codeMatch) return;
                
                const code = codeMatch[1];
                
                // 提取引号内的数据字段
                const dataMatch = line.match(/"([^"]+)"/);
                if (!dataMatch) return;
                
                // 注意：腾讯API的字段分隔符是 ~ 不是逗号
                const fields = dataMatch[1].split('~');
                if (fields.length >= 4) {
                    const price = parseFloat(fields[3]);
                    if (!isNaN(price) && price > 0) {
                        prices[code] = price;
                    }
                }
            });
        } catch (error) {
            console.error('解析腾讯API响应失败:', error);
        }

        return prices;
    },

    /**
     * 从新浪API获取价格（备用）
     */
    async _fetchFromSina(codes) {
        try {
            const queryStr = codes.join(',');
            const url = this.SINA_API + queryStr;

            const response = await fetch(url);
            const text = await response.text();

            return this._parseSinaResponse(text, codes);
        } catch (error) {
            console.error('新浪API调用失败:', error);
            return {};
        }
    },

    /**
     * 解析新浪API响应
     */
    _parseSinaResponse(text, codes) {
        const prices = {};
        
        try {
            codes.forEach((code, index) => {
                const pattern = new RegExp(`hq_str_${code}="([^"]+)"`);
                const match = text.match(pattern);
                
                if (match) {
                    const fields = match[1].split(',');
                    if (fields.length > 3) {
                        const price = parseFloat(fields[3]);
                        if (!isNaN(price)) {
                            prices[code] = price;
                        }
                    }
                }
            });
        } catch (error) {
            console.error('解析新浪API响应失败:', error);
        }

        return prices;
    },

    /**
     * 获取港币兑人民币汇率
     * 优先从东方财富API获取实时汇率，失败则使用默认值0.91
     * @returns {Promise<number>} - 汇率值，如 0.91
     */
    async fetchExchangeRate() {
        // 默认汇率
        const DEFAULT_RATE = 0.91;
        
        try {
            // 尝试从东方财富获取实时汇率（港币兑人民币）
            // 使用JSONP方式
            const url = 'https://push2.eastmoney.com/api/qt/ulist.np/get?fields=f2,f12,f14&secids=116.HKDCNH';
            
            let data;
            try {
                data = await this.jsonpRequest(url);
            } catch (e) {
                // JSONP失败，尝试fetch
                try {
                    const resp = await fetch(url, {
                        headers: { 'Referer': 'https://www.eastmoney.com/' }
                    });
                    data = await resp.json();
                } catch (fetchError) {
                    console.warn('获取实时汇率失败，使用默认值:', fetchError);
                    return DEFAULT_RATE;
                }
            }
            
            // 解析东方财富返回的汇率数据
            // 返回格式: {"data":{"f2":0.91,"f12":"HKDCNH","f14":"港币/人民币"}}
            if (data && data.data && data.data.f2) {
                const rate = parseFloat(data.data.f2);
                if (!isNaN(rate) && rate > 0) {
                    return rate;
                }
            }
            
            return DEFAULT_RATE;
        } catch (error) {
            console.warn('获取汇率失败，使用默认值:', error);
            return DEFAULT_RATE;
        }
    },

    /**
     * 强制刷新缓存
     */
    clearCache() {
        Storage.clearCache();
        this.cache = {};
    }
};
