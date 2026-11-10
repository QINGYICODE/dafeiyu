export const sourceCatalog = {
  bilibili: { name: 'B 站', kind: 'social', note: '图文、视频简介与可见文字', home: 'https://www.bilibili.com/' },
  douyin: { name: '抖音', kind: 'social', note: '部分链接可读，可能遇到验证', home: 'https://www.douyin.com/' },
  xiaohongshu: { name: '小红书', kind: 'social', note: '当前环境可能受访问限制', home: 'https://www.xiaohongshu.com/' },
  weibo: { name: '微博', kind: 'social', note: '公开文字，可能要求登录', home: 'https://weibo.com/' },
  gengbaike: { name: '梗百科', kind: 'dictionary', note: 'geng8.com · 梗的含义、出处和用法', home: 'https://www.geng8.com/' },
  gengwiki: { name: '梗百科 · geng.page', kind: 'dictionary', note: '梗的原作语境、流传用法与素材', home: 'https://geng.page/' },
  fabiaoqing: { name: '发表情', kind: 'stickers', note: '按情绪查找图片和 GIF，筛选后收藏', home: 'https://www.fabiaoqing.com/' },
};

export function sourceSearchUrl(platform, topic) {
  const query = encodeURIComponent(topic);
  return {
    bilibili: `https://search.bilibili.com/${/表情|meme|梗图/i.test(topic) ? 'article' : 'all'}?keyword=${query}`,
    douyin: `https://www.douyin.com/search/${query}?type=video`,
    xiaohongshu: `https://www.xiaohongshu.com/search_result?keyword=${query}`,
    weibo: `https://m.weibo.cn/search?containerid=${encodeURIComponent(`100103type=1&q=${topic}`)}`,
    gengbaike: `https://www.geng8.com/search/?q=${query}`,
    gengwiki: `https://geng.page/#${encodeURIComponent('搜索')}/${query}`,
    fabiaoqing: `https://www.fabiaoqing.com/search/bqb/keyword/${query}/type/bq/page/1.html`,
  }[platform];
}
