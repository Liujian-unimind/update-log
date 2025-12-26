/**
 * GitHub 存储模块
 * 用于将更新日志数据存储到 GitHub 仓库中
 */

class GitHubStorage {
    constructor() {
        this.CONFIG_KEY = 'github_config';
        this.DATA_PATH = 'data/logs.json'; // 数据文件在仓库中的路径
        this.config = null;
        this.loadConfig();
    }

    /**
     * 加载配置
     */
    loadConfig() {
        const configStr = localStorage.getItem(this.CONFIG_KEY);
        if (configStr) {
            try {
                this.config = JSON.parse(configStr);
                return true;
            } catch (error) {
                console.error('配置加载失败:', error);
                return false;
            }
        }
        return false;
    }

    /**
     * 检查是否已配置
     */
    isConfigured() {
        return this.config && this.config.username && this.config.repo && this.config.token;
    }

    /**
     * 获取 API 基础 URL
     */
    getApiUrl() {
        if (!this.isConfigured()) {
            throw new Error('GitHub 未配置');
        }
        return `https://api.github.com/repos/${this.config.username}/${this.config.repo}/contents/${this.DATA_PATH}`;
    }

    /**
     * 获取请求头
     */
    getHeaders() {
        if (!this.isConfigured()) {
            throw new Error('GitHub 未配置');
        }
        return {
            'Authorization': `token ${this.config.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        };
    }

    /**
     * 从 GitHub 读取数据
     */
    async loadLogs() {
        if (!this.isConfigured()) {
            console.warn('GitHub 未配置，使用本地存储');
            return this.loadLogsFromLocal();
        }

        try {
            const response = await fetch(this.getApiUrl(), {
                method: 'GET',
                headers: this.getHeaders()
            });

            if (response.status === 404) {
                // 文件不存在，返回空数组
                console.log('GitHub 数据文件不存在，将创建新文件');
                return [];
            }

            if (!response.ok) {
                throw new Error(`GitHub API 错误: ${response.status}`);
            }

            const data = await response.json();

            // GitHub API 返回的内容是 Base64 编码的
            const content = atob(data.content);
            const logs = JSON.parse(content);

            // 同时保存到本地作为缓存
            this.saveLogsToLocal(logs);

            return logs;
        } catch (error) {
            console.error('从 GitHub 加载数据失败:', error);
            console.log('尝试从本地缓存加载...');
            return this.loadLogsFromLocal();
        }
    }

    /**
     * 保存数据到 GitHub
     */
    async saveLogs(logs) {
        if (!this.isConfigured()) {
            console.warn('GitHub 未配置，仅保存到本地');
            return this.saveLogsToLocal(logs);
        }

        try {
            // 首先尝试获取当前文件的 SHA（更新文件时需要）
            let sha = null;
            try {
                const getResponse = await fetch(this.getApiUrl(), {
                    method: 'GET',
                    headers: this.getHeaders()
                });

                if (getResponse.ok) {
                    const fileData = await getResponse.json();
                    sha = fileData.sha;
                }
            } catch (error) {
                console.log('文件不存在，将创建新文件');
            }

            // 准备数据
            const content = JSON.stringify(logs, null, 2);
            const encodedContent = btoa(unescape(encodeURIComponent(content))); // 处理中文编码

            const requestBody = {
                message: `更新日志数据 - ${new Date().toLocaleString('zh-CN')}`,
                content: encodedContent,
                branch: this.config.branch || 'main'
            };

            // 如果文件存在，需要提供 SHA
            if (sha) {
                requestBody.sha = sha;
            }

            // 发送请求
            const response = await fetch(this.getApiUrl(), {
                method: 'PUT',
                headers: this.getHeaders(),
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'GitHub API 错误');
            }

            // 同时保存到本地缓存
            this.saveLogsToLocal(logs);

            console.log('✅ 数据已同步到 GitHub');
            return true;
        } catch (error) {
            console.error('保存到 GitHub 失败:', error);
            alert('⚠️ 数据同步到 GitHub 失败！\n\n错误: ' + error.message + '\n\n数据已保存到本地缓存，请稍后重试同步。');
            // 失败时仍保存到本地
            this.saveLogsToLocal(logs);
            return false;
        }
    }

    /**
     * 从本地 localStorage 加载数据（作为后备方案）
     */
    loadLogsFromLocal() {
        const data = localStorage.getItem('updateLogs');
        return data ? JSON.parse(data) : [];
    }

    /**
     * 保存数据到本地 localStorage（作为缓存）
     */
    saveLogsToLocal(logs) {
        try {
            localStorage.setItem('updateLogs', JSON.stringify(logs));
            return true;
        } catch (error) {
            if (error.name === 'QuotaExceededError') {
                console.error('本地存储空间不足');
            } else {
                console.error('保存到本地失败:', error);
            }
            return false;
        }
    }

    /**
     * 手动同步：从 GitHub 拉取最新数据
     */
    async syncFromGitHub() {
        if (!this.isConfigured()) {
            throw new Error('请先配置 GitHub 连接');
        }

        const logs = await this.loadLogs();
        return logs;
    }

    /**
     * 手动同步：推送本地数据到 GitHub
     */
    async syncToGitHub() {
        if (!this.isConfigured()) {
            throw new Error('请先配置 GitHub 连接');
        }

        const logs = this.loadLogsFromLocal();
        return await this.saveLogs(logs);
    }

    /**
     * 获取配置信息（用于显示）
     */
    getConfigInfo() {
        if (!this.isConfigured()) {
            return null;
        }

        return {
            username: this.config.username,
            repo: this.config.repo,
            branch: this.config.branch || 'main',
            repoUrl: `https://github.com/${this.config.username}/${this.config.repo}`
        };
    }
}

// 创建全局实例
const githubStorage = new GitHubStorage();
