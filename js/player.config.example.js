/*!***********************************************
 * EasyMusicPlayer 2.9
 * 播放器配置文件
 * 受 MKOnlinePlayer 的启发: mkblog.cn
 *************************************************/
// 建议修改前先备份一下

// 获取 歌曲ID 的方法：
// 先在下面开启logMusicId，然后按 F12 打开浏览器的控制台，播放歌曲。
// 获取 网易云歌单ID 的方法：
// 按 F12 打开浏览器的控制台，输入musicList

"use strict";

// 播放器功能配置
var mkPlayer = {
	api: "api.php",            // api地址
	perPage: 20,               // 搜索结果一次加载多少条
	defaultList: -1,           // 默认播放列表编号, -1则显示[播放列表]
	logMusicId: false,         // 控制台记录歌曲ID
	autoplay: false,           // 自动播放 *此选项在现代浏览器可能无效
	mobileBg: false,           // 移动端封面背景
	dotShine: 0,               // 进度条的小点闪动 (1:电脑端, 2:移动端)
	volume: 0.5,               // 默认音量值 0~1
	version: "23/05/18-3.1.9",
	autoAddToPlaying: false,   // 自动把播放的歌曲加入正在播放
	replacePlayList: false,    // 若正在播放为空，用第一个播放的歌单替换正在播放
	historyMax: 100,           // 历史记录最大长度
	storageType: "web",        // 播放列表存放位置 local, web
	picSize: "?param=300y300", // 图片大小
	autoShowLogin: false,      // 自动弹出登录窗口
	autoPlaySearch: false,     // 搜索结果自动播放
	nextListMax: 99,           // 下一首播放最大大小
	preloadPercent: 0.9,       // 这一首播放到多少时预加载下一首, 大于1禁用
	customClear: false,        // 允许清空自定义列表
	showBuffer: false          // 显示缓冲状态
};

console.info('EMP ' + mkPlayer.version + ' by Roj234\nInspired from MKOnlinePlayer(discontinued) @ mengkun(https://mkblog.cn)');

// 存储全局变量
// 
// audio: 音频对象
// errType 连续播放失败次数
// 
// dataBox 当前显示的数据区 (sheet list player)
// 
// listDisplay 正在显示的列表ID
// listPlaying 正在播放的列表ID
// idPlaying 当前播放的歌曲在 listPlaying 中的 ID
// currentPlaying 当前播放的歌曲对象
// 
// lyric: 歌词列表
// 
// order: 播放顺序
// 
// webTitle: 网页原标题
var rem = {};

// 插件系统
rem.plugins = {};
mkPlayer.plugin = (name, c) => rem.plugins[name] = c;

var musicList = [
    // 以下4个系统预留列表请勿更改，否则可能导致程序无法正常运行！
    {
        name: "搜索结果", cover: "", item: [], 
        hidden: true // 隐藏
    },
    {
        name: "正在播放", cover: "", item: []
    },
    {
        name: "播放历史", cover: "images/history.png", item: []
    },  
    {
        name: "下一首播放", cover: "", item: [], hidden: true
    },
    // 以上4个系统预留列表请勿更改，否则可能导致程序无法正常运行！
    
    //*********************************************
    // 自定义列表开始，您可以自由添加您的自定义列表
    {
        name: "本地缓存", 
        id: "music\\", 
        lazyload: 1, 
        cover: "images/folder.png", 
        source: "file"
    },
    {
        name: "D:\\Music", 
        id: "D:\\Music", 
        lazyload: 1, 
        cover: "images/folder.png", 
        source: "file"
    },
    {
        name: "云音乐热歌榜", 
        id: 3778678, 
        lazyload: 1, 
        cover: "https://p1.music.126.net/ZyUjc7K_GDpD8MO1-GQkmA==/109951166952706664.jpg?param=300y300"
    },
    {
        name: "云音乐新歌榜", 
        id: 3779629, 
        lazyload: 1, 
        cover: "https://p1.music.126.net/wVmyNS6b_0Nn-y6AX8UbpQ==/109951166952686384.jpg?param=300y300"
    },
    /*{
        id: 4395559     // 华语金曲榜
    },
    {
        id: 64016       // 中国TOP排行榜（内地榜）
    },
    {
        id: 112504      // 中国TOP排行榜（港台榜）
    },*/
    {
        name: "云音乐飙升榜", 
        id: 19723756, 
        lazyload: 1
    },
    {
        name: "云音乐原创榜", 
        id: 2884035, 
        lazyload: 1
    },
    {
        name: "美国热门歌曲", 
        id: 11641012,    // Itunes
        lazyload: 1
    },
    {
        name: "云音乐电音榜", 
        id: 1978921795,
        lazyload: 1
    },
    
    // 自定义列表教程开始！
    // 方式一：手动创建列表并添加歌曲信息
    // 温馨提示：各大音乐平台获取到的外链有效期均较短，因此 url 值应该设置为空，以让程序临时抓取
    /*{
        name: "自定义列表",   // 播放列表名字
        cover: "https://p3.music.126.net/34YW1QtKxJ_3YnX9ZzKhzw==/2946691234868155.jpg", // 播放列表封面图像
        creatorName: "",        // 列表创建者名字(没用到)
        creatorAvatar: "",      // 列表创建者头像(没用到)
        item: [                 // 这里面放歌曲
            {
                id: "436514312",  // 音乐ID
                name: "成都",  // 音乐名字
                artist: "赵雷", // 艺术家名字
                album: "成都",    // 专辑名字
                source: "netease",     // 音乐来源
                url_id: "436514312",  // 链接ID
                pic_id: "2946691234868155",  // 封面ID
                lyric_id: "436514312",  // 歌词ID
                pic: "https://p3.music.126.net/34YW1QtKxJ_3YnX9ZzKhzw==/2946691234868155.jpg",    // 专辑图片
                url: ""   // mp3链接（此项建议不填，除非你有该歌曲的比较稳定的外链）
            },
            // 下面演示插入各个平台的音乐。。。
            {
                id: "121004737",
                name: "难忘今宵",
                artist: "李谷一",
                album: "难忘今宵",
                source: "baidu",        // 百度
                url_id: "121004737",
                pic_id: "121004737",
                lyric_id: "121004737",
                pic: "https://musicdata.baidu.com/data2/pic/2733cd9816b8618afd3038d5d9444940/266105319/266105319.jpg@s_0,w_150",
                url: ""
            }  // 列表中最后一首歌大括号后面不要加逗号
        ]
    },
    // 方式二：直接提供歌单ID
    {
        name: "Vanilla Plus", 
        cover: "https://p1.music.126.net/Zf_eqEsBCXj884cx3heqqA==/109951163030548564.jpg?param=100y100", 
        id: 2284288458,   // 默认网易云
        //source: 'xx',   // 可以修改
        lazyload: 1       // 稍后再加载
    } // 播放列表的最后一项大括号后面不要加逗号*/
];