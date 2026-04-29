/**
 * parser.js
 * 自然语言指令解析器
 * 解析如"所有产品买一个点贵州茅台"的指令
 */

const Parser = {
    /**
     * 解析交易指令
     * @param {string} instruction - 原始指令文本
     * @param {Array} products - 产品列表
     * @returns {Object|null} - 解析结果或null（解析失败）
     */
    parse(instruction, products) {
        if (!instruction || !instruction.trim()) {
            return null;
        }

        instruction = instruction.trim();

        // 检查是否为"全卖"格式的特殊指令（如"贵州茅台全卖了吧"）
        const fullSellMatch = instruction.match(/^(.+?)(全卖|都卖|清仓)(了|一下|吧|？|$)/);
        if (fullSellMatch) {
            return {
                type: 'info_only',
                direction: 'sell',
                targetStockName: fullSellMatch[1].trim(),
                rawInstruction: instruction
            };
        }

        // 提取操作方向（买/卖）
        const direction = this._extractDirection(instruction);
        if (!direction) {
            return null;
        }

        // 提取操作数量（点数）
        const points = this._extractPoints(instruction);
        if (points === null) {
            return null;
        }

        // 提取目标股票名称（如"贵州茅台"）
        const targetStockName = this._extractTargetStockName(instruction);

        // 提取产品范围（所有产品 / 指定产品）
        const productRange = this._extractProductRange(instruction);

        // 确定应该操作的产品列表
        let selectedProducts = [];
        
        if (productRange === 'all') {
            // 所有产品
            selectedProducts = products.map(p => p.id);
        } else if (productRange === 'specified') {
            // 指定的产品
            const specifiedNames = this._extractSpecifiedProducts(instruction);
            selectedProducts = specifiedNames
                .map(name => {
                    const product = products.find(p => 
                        p.name === name || p.name.includes(name)
                    );
                    return product ? product.id : null;
                })
                .filter(id => id !== null);
        }

        // 如果没有找到产品，使用所有产品
        if (selectedProducts.length === 0) {
            selectedProducts = products.map(p => p.id);
        }

        return {
            direction,      // 'buy' 或 'sell'
            points,         // 数字，如 1, 0.5, 2.5
            productRange,   // 'all' 或 'specified'
            selectedProducts, // 产品ID数组
            targetStockName, // 目标股票名称（如"贵州茅台"）
            rawInstruction: instruction
        };
    },
    
    /**
     * 提取目标股票名称
     * @private
     */
    _extractTargetStockName(instruction) {
        // 尝试匹配"点"后面的内容作为股票名称
        // 例如："所有产品买一个点贵州茅台" -> 提取"贵州茅台"
        
        // 尝试匹配"点"后面的内容
        const pointMatch = instruction.match(/点(.+)$/);
        if (pointMatch && pointMatch[1]) {
            const potentialName = pointMatch[1].trim();
            // 排除数字和其他符号
            if (!/^\d/.test(potentialName) && potentialName.length >= 2) {
                return potentialName;
            }
        }
        
        return null;
    },

    /**
     * 提取操作方向
     * @private
     */
    _extractDirection(instruction) {
        const buyPatterns = /买入?|增加|加仓|做多/g;
        const sellPatterns = /卖出?|减少|减仓|做空/g;

        if (buyPatterns.test(instruction)) {
            return 'buy';
        }
        if (sellPatterns.test(instruction)) {
            return 'sell';
        }

        return null;
    },

    /**
     * 提取操作点数
     * @private
     */
    _extractPoints(instruction) {
        // 匹配模式：数字 + (个点|点|%) 或 数字%
        // 如："一个点"、"1个点"、"0.5个点"、"2.5点"、"1%"等
        
        // 先尝试中文数字（包含"两"）
        const chineseMatch = instruction.match(/(一|二|两|三|四|五|六|七|八|九|十|二十|三十|百)个?点/);
        if (chineseMatch) {
            const chineseNum = chineseMatch[1];
            const num = this._convertChineseToNumber(chineseNum);
            if (num !== null) {
                return num;
            }
        }

        // 尝试阿拉伯数字
        const arabicMatch = instruction.match(/([0-9]+(?:\.[0-9]+)?)个?点|([0-9]+(?:\.[0-9]+)?)%/);
        if (arabicMatch) {
            const numStr = arabicMatch[1] || arabicMatch[2];
            const num = parseFloat(numStr);
            if (!isNaN(num)) {
                return num;
            }
        }

        return null;
    },

    /**
     * 将中文数字转换为阿拉伯数字
     * @private
     */
    _convertChineseToNumber(chineseNum) {
        const mapping = {
            '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5,
            '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
            '二十': 20, '三十': 30
        };
        return mapping[chineseNum] || null;
    },

    /**
     * 提取产品范围类型
     * @private
     */
    _extractProductRange(instruction) {
        // 检查是否包含"所有"相关关键词
        if (/所有|所有产品|所有基金|全部|全部产品|所有的|整个/.test(instruction)) {
            return 'all';
        }

        // 检查是否包含具体产品名称
        const specifiedNames = this._extractSpecifiedProducts(instruction);
        if (specifiedNames && specifiedNames.length > 0) {
            return 'specified';
        }

        // 默认为所有产品
        return 'all';
    },

    /**
     * 从指令中提取明确命名的产品
     * @private
     */
    _extractSpecifiedProducts(instruction) {
        const specifiedNames = [];
        
        // 常见产品名称组合（可根据实际扩展）
        const knownProductKeywords = [
            '原子1号', '原子2号', '原子3号', '原子5号',
            '尊享1号', '尊享2号',
            '资管', '基金', '产品'
        ];

        knownProductKeywords.forEach(keyword => {
            if (instruction.includes(keyword)) {
                specifiedNames.push(keyword);
            }
        });

        return specifiedNames;
    },

    /**
     * 验证解析结果的合理性
     */
    validate(parseResult) {
        if (!parseResult) {
            return { valid: false, error: '无法解析指令' };
        }

        // info_only 类型只需要有股票名称即可
        if (parseResult.type === 'info_only') {
            if (!parseResult.targetStockName) {
                return { valid: false, error: '未能识别股票名称' };
            }
            return { valid: true };
        }

        if (!parseResult.direction) {
            return { valid: false, error: '未识别操作方向（买/卖）' };
        }

        if (parseResult.points === null || parseResult.points === undefined) {
            return { valid: false, error: '未识别操作点数' };
        }

        if (parseResult.points < 0 || parseResult.points > 100) {
            return { valid: false, error: '点数应该在0-100之间' };
        }

        if (!parseResult.selectedProducts || parseResult.selectedProducts.length === 0) {
            return { valid: false, error: '未选择任何产品' };
        }

        return { valid: true };
    }
};
