/**
 * storage.js
 * 本地数据存储管理模块
 */

const Storage = {
    // 存储键值常量
    KEYS: {
        PRODUCTS: 'trading_products',
        TRADES: 'trading_trades',
        FEEDBACK: 'trading_feedback',
        API_CACHE: 'trading_api_cache'
    },

    // 初始化存储
    init() {
        // 如果是首次使用，初始化默认数据
        if (!localStorage.getItem(this.KEYS.PRODUCTS)) {
            this.setProducts([
                { id: 'p1', name: '原子1号', netAssets: 10000000 },
                { id: 'p2', name: '原子2号', netAssets: 8000000 },
                { id: 'p3', name: '尊享1号', netAssets: 12000000 },
                { id: 'p4', name: '原子3号', netAssets: 7000000 },
                { id: 'p5', name: '原子5号', netAssets: 9000000 }
            ]);
        }
        if (!localStorage.getItem(this.KEYS.TRADES)) {
            this.setTrades([]);
        }
        if (!localStorage.getItem(this.KEYS.FEEDBACK)) {
            this.setFeedback([]);
        }
    },

    // ========== 产品管理 ==========
    
    /**
     * 获取所有产品
     */
    getProducts() {
        try {
            const data = localStorage.getItem(this.KEYS.PRODUCTS);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('获取产品列表失败:', error);
            return [];
        }
    },

    /**
     * 保存产品列表
     */
    setProducts(products) {
        try {
            localStorage.setItem(this.KEYS.PRODUCTS, JSON.stringify(products));
            return true;
        } catch (error) {
            console.error('保存产品列表失败:', error);
            return false;
        }
    },

    /**
     * 添加产品
     */
    addProduct(product) {
        const products = this.getProducts();
        product.id = 'p_' + Date.now();
        products.push(product);
        return this.setProducts(products);
    },

    /**
     * 更新产品
     */
    updateProduct(productId, updates) {
        const products = this.getProducts();
        const index = products.findIndex(p => p.id === productId);
        if (index !== -1) {
            products[index] = { ...products[index], ...updates };
            return this.setProducts(products);
        }
        return false;
    },

    /**
     * 删除产品
     */
    deleteProduct(productId) {
        const products = this.getProducts().filter(p => p.id !== productId);
        return this.setProducts(products);
    },

    /**
     * 根据名称查找产品
     */
    findProductByName(name) {
        const products = this.getProducts();
        return products.find(p => p.name === name);
    },

    /**
     * 获取产品名称列表
     */
    getProductNames() {
        return this.getProducts().map(p => p.name);
    },

    /**
     * 导出产品配置为JSON
     */
    exportProducts() {
        const products = this.getProducts();
        return JSON.stringify(products, null, 2);
    },

    /**
     * 导入产品配置
     */
    importProducts(jsonString) {
        try {
            const products = JSON.parse(jsonString);
            if (!Array.isArray(products)) {
                throw new Error('格式不正确：应为数组');
            }
            return this.setProducts(products);
        } catch (error) {
            console.error('导入产品配置失败:', error);
            return false;
        }
    },

    // ========== 交易记录管理 ==========

    /**
     * 获取交易记录
     */
    getTrades() {
        try {
            const data = localStorage.getItem(this.KEYS.TRADES);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('获取交易记录失败:', error);
            return [];
        }
    },

    /**
     * 保存交易记录
     */
    setTrades(trades) {
        try {
            localStorage.setItem(this.KEYS.TRADES, JSON.stringify(trades));
            return true;
        } catch (error) {
            console.error('保存交易记录失败:', error);
            return false;
        }
    },

    /**
     * 添加交易记录
     */
    addTrade(trade) {
        const trades = this.getTrades();
        trade.id = 'trade_' + Date.now();
        trade.timestamp = new Date().toISOString();
        trades.push(trade);
        return this.setTrades(trades);
    },

    // ========== 反馈记录管理 ==========

    /**
     * 获取反馈记录
     */
    getFeedback() {
        try {
            const data = localStorage.getItem(this.KEYS.FEEDBACK);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('获取反馈记录失败:', error);
            return [];
        }
    },

    /**
     * 保存反馈记录
     */
    setFeedback(feedback) {
        try {
            localStorage.setItem(this.KEYS.FEEDBACK, JSON.stringify(feedback));
            return true;
        } catch (error) {
            console.error('保存反馈记录失败:', error);
            return false;
        }
    },

    /**
     * 添加反馈记录
     */
    addFeedback(feedback) {
        const feedbackList = this.getFeedback();
        feedback.id = 'fb_' + Date.now();
        feedback.timestamp = new Date().toISOString();
        feedbackList.push(feedback);
        return this.setFeedback(feedbackList);
    },

    // ========== API缓存管理 ==========

    /**
     * 获取缓存的价格数据
     */
    getCachedPrice(codes) {
        try {
            const cache = JSON.parse(localStorage.getItem(this.KEYS.API_CACHE) || '{}');
            const result = {};
            const now = Date.now();
            const expiredCodes = [];

            codes.forEach(code => {
                if (cache[code] && (now - cache[code].timestamp < 60000)) {
                    result[code] = cache[code].price;
                } else {
                    expiredCodes.push(code);
                }
            });

            return { prices: result, needUpdate: expiredCodes };
        } catch (error) {
            console.error('获取缓存价格失败:', error);
            return { prices: {}, needUpdate: codes };
        }
    },

    /**
     * 更新价格缓存
     */
    setCachedPrice(priceData) {
        try {
            let cache = {};
            try {
                cache = JSON.parse(localStorage.getItem(this.KEYS.API_CACHE) || '{}');
            } catch {}

            const now = Date.now();
            Object.keys(priceData).forEach(code => {
                cache[code] = {
                    price: priceData[code],
                    timestamp: now
                };
            });

            localStorage.setItem(this.KEYS.API_CACHE, JSON.stringify(cache));
            return true;
        } catch (error) {
            console.error('保存价格缓存失败:', error);
            return false;
        }
    },

    /**
     * 清空所有缓存
     */
    clearCache() {
        try {
            localStorage.removeItem(this.KEYS.API_CACHE);
            return true;
        } catch (error) {
            console.error('清空缓存失败:', error);
            return false;
        }
    }
};

// 初始化存储
document.addEventListener('DOMContentLoaded', () => {
    Storage.init();
});
