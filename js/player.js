/*!***********************************************
 * EasyMusicPlayer 2.8
 * 受 MKOnlinePlayer 的启发: mkblog.cn
 *************************************************/
window.apply = function(o, n) {
  for (let k in o) {
    if (n[k] === undefined) n[k] = o[k];
  }
  return n;
};

$(function() {
	let config = window.mkPlayer, rem = window.rem, musicList = window.musicList;
	let msg = $.dialog.msg;
	// 这些变量也外部用不到: 进度条, 歌词进度, 背景计时器, 自动缓存
	let lastProgress = -1, lastLyric = -1, changeBgTimeout = -1, cache;

	let isMobile = {
		Android: function() {
			return navigator.userAgent.match(/Android/i) ? true : false;
		},
		BlackBerry: function() {
			return navigator.userAgent.match(/BlackBerry/i) ? true : false;
		},
		iOS: function() {
			return navigator.userAgent.match(/iPhone|iPad|iPod/i) ? true : false;
		},
		Windows: function() {
			return navigator.userAgent.match(/IEMobile/i) ? true : false;
		},
		any: function() {
			return isMobile.Android() || isMobile.BlackBerry() || isMobile.iOS() || isMobile.Windows();
		}
	};

	$.ajax.config.beforeSend = function(xhr) { xhr.setRequestHeader("Content-Type","application/x-www-form-urlencoded; charset=UTF-8"); };
	$.ajax.config.timeout = 20000;
	let ajaxErr = $.ajax.config.error = function(xhr, st, err, op) {
		op = op || "";
		console.warn(err,op);
		if(xhr.status == 0) { $.dialog({id:"net_error", title: "网络错误", content: op + ": <b>网络中断了!</b>", lock: 1}); return; }
		msg(op + "操作失败了: " + xhr.status);
	//	stop();
	};

	let mediaHub;
	if ('mediaSession' in navigator) {
		let m = navigator.mediaSession;
		m.setActionHandler("previoustrack", () => nextMusic(-1));
		m.setActionHandler("nexttrack", () => nextMusic(1));
		m.setActionHandler("seekbackward", () => {
			rem.audio[0].currentTime -= 10;
		});
		m.setActionHandler("seekforward", () => {
			rem.audio[0].currentTime += 10;
		});
		m.setActionHandler("seekto", () => nextMusic(1));
		m.setActionHandler("play", pause);
		m.setActionHandler("pause", pause);
		mediaHub = {
			switchTrack: function(t) {
				m.metadata = new MediaMetadata({
					title: t.name,
					artist: t.artist,
					album: t.album,
					artwork: t.pic&&t.pic!='err'?[{
						src: t.pic,
						sizes: "300x300",
						type: "image/jpeg"
					}]:[]
				});
			},
			pause: function(p) {
				m.playbackState = p?"paused":"playing";
			},
			updatePos: function() {
				/*let a = rem.audio[0];
				m.setPositionState({
					position: a.currentTime, 
					duration: a.duration, 
					playbackRate: a.playbackRate
				});*/
			}
		};
	}

	// 音频错误处理函数
	function audioErr(err) {
		if(err.message) {
			if(err.message.indexOf("interact") != -1) {
				msg("无法自动播放");
				delete rem.idPlaying;
				$(".playing").removeClass("playing");
				return;
			}
		}

		let ado = rem.audio[0];

		if (rem.errCount > 1) { // 连续播放失败的歌曲过多
			console.error(err);
			$("#music-progress").removeClass("loading").addClass("load-fail");
			rem.currentPlaying = null;
			if(rem.errCount != 99) {
				ado.pause();
				msg('播放似乎出了点问题~');
			}
			rem.errCount = 99;
		} else {
			// 解决网易云音乐部分歌曲无法播放问题
			let url = ado.currentSrc;
			if (url == "") {
				url = "err";
			}

			// 第一次
			if (rem.errCount == -1) {
				let flag = 1;
				if (url.indexOf("m7c.music") > 0 || url.indexOf("m8c.music") > 0) {
					url = url
						.replace(/m7c.music./g, "m7.music.")
						.replace(/m8c.music./g, "m8.music.");
				} else {
					let url1 = url
						.replace(/m7.music./g, "m7c.music.")
						.replace(/m8.music./g, "m8c.music.");
					flag = url1 != url;
				}

				rem.errCount = 0;
				if(flag) {
					ado.src = url;
					ado.play().then(function() {
						rem.errCount = -1;
					}, audioErr);

					return;
				}
			}

			if (rem.errCount == 0) { // 第二次
				if(musicList[rem.listPlaying]) {
					let msc = musicList[rem.listPlaying].item[rem.idPlaying];
					if(msc) {
						ajaxUrl(msc, play);
						rem.errCount = 1;
						return;
					}
				}

				rem.errCount = 99;
				ado.pause();
				stop();
				msg('歌曲无法播放');
				return;
			}

			rem.errCount++;
		}
	}

	// 点击暂停按钮
	function pause() {
		if (rem.paused === false) { // 之前是播放状态
			rem.audio[0].pause(); // 暂停
		} else {
			// 第一次点播放
			if (rem.listPlaying == null) {
				if (!musicList[1].item.length) {
					if(config.replacePlayList && musicList[rem.listDisplay]?.item.length) {
						musicList[1].item = Array.from(musicList[rem.listDisplay].item);

						// 保存
						dataStore('playing', musicList[1].item);
					} else {
						msg("没有歌曲可以播放!").shake();
						return;
					}
				}
				rem.listPlaying = 1;
				playList(0);
				return;
			}

			if (!rem.currentPlaying) return;
			rem.audio[0].play().then(function() {
				rem.errCount = -1;
			}, audioErr);
		}
	}

	function cylOrder() {
		if (++rem.order > 3) {
			rem.order = 0;
		}
		unRandom();
		dataStore("order", rem.order);
		updateOrder();
	}

	function updateOrder() {
		let el = $(".btn-order").removeClass("single list linear random");

		delete rem.repeatA; delete rem.repeatB;

		rem.audio[0].loop = false;
		delete rem.rndId;
		switch (rem.order) {
			case 0:
				el.addClass("linear").attr("title", "顺序播放");
				break;
			case 1:
				el.addClass("single").attr("title", "单曲循环");
				rem.audio[0].loop = true;
				break;
			case 2:
				el.addClass("list").attr("title", "列表循环");
				break;
			case 3:
				el.addClass("random").attr("title", "随机播放");
				break;
		}
	}

	function shuffle(x) {
		for (let i = 0; i < x.length; i++) {
			let j = Math.floor(x.length * Math.random());
			let t = x[i];
			 x[i] = x[j];
			 x[j] = t;
		}
	}

	function unRandom(myId) {
		let list = musicList[myId == null ? rem.rndListId : myId];
		if (list && list.item0) {
			delete list.item0;
			delete rem.realIdPlaying;
			delete rem.rndListId;
		}
	}

	// 播放下一首歌
	function nextMusic(off) {
		off = off || 1;
		// 排除下一首播放
		if (rem.order == 3 && rem.listPlaying != 3) {
			let list = musicList[rem.listPlaying];
			if (!list) return;

			if (rem.rndListId !== rem.listPlaying) {
				unRandom();

				rem.rndListId = rem.listPlaying;
				let a = list.item0 = Array(list.item.length);
				for(let i=list.item.length-1;i>=0;i--)a[i]=i;
				shuffle(a);

				rem.realIdPlaying = a.indexOf(rem.idPlaying);
			}
			let c = rem.idPlaying = rem.realIdPlaying;

			c += off;
			if (c < 0) c = list.item.length-1;
			else if (c >= list.item.length) c = 0;
			rem.realIdPlaying = c;
		}
		playList(rem.idPlaying + off);
	}

	// 显示的列表中的某一项点击后的处理函数
	// 参数：歌曲在列表中的编号
	function listClick(no) {
		if(rem.listPlaying != rem.listDisplay) {
			delete rem.prefetch.cacheId;
			rem.listPlaying = rem.listDisplay;
			$("#sheet .sheet").removeClass("playing").findSelf("$data-no=" + rem.listPlaying).addClass("playing");
		// 20221222 不同列表同一项
		// 20230130 修复搜索列表点击bug
		} else if(rem.idPlaying == no && musicList[rem.listPlaying]?.item[no] == rem.currentPlaying) {
			// 已经在播放，时间调到开始位置
			rem.audio[0].currentTime = 0;
			return true;
		}
		unRandom(rem.listDisplay);

		playList(no);

		if (rem.listPlaying != 1 && config.autoAddToPlaying) {
			// 搜索结果自动加入正在播放
			addList(musicList[rem.listPlaying].item[no]);
		}

		return true;
	}

	// 播放正在播放列表中的歌曲
	// 参数：歌曲在列表中的ID
	function playList(id) {
		let list = musicList[rem.listPlaying];
		if(!list) {
			msg("没有歌曲可以播放!").shake();
			return;
		}

		let songs = list.item;
		// 没有歌曲，跳出
		if (!songs || !songs.length) {
			msg("没有歌曲可以播放!").shake();
			return true;
		}

		if (id >= songs.length || id != id) id = 0;
		if (id < 0) id = songs.length - 1;
		if (list.item0) id = list.item0[id];

		stop();
		rem.idPlaying = id;

		// 如果链接为空，则获取后再播放
		if(!songs[id].url) ajaxUrl(songs[id], play);
		else play(songs[id]);
	}

	// 播放音乐
	// 参数：要播放的音乐数组
	function play(music) {
		let url = music.url;

		// 遇到错误不播放
		if (url == 'err' || url == "" || url == null) {
			audioErr("No url");
			return false;
		}

		if(config.logMusicId) {
			console.log("开始播放", music.name, music.artist, music.album);
			console.info("MP3网址", url);
			console.info("图片网址", music.pic);
			console.info("歌曲源, ID", music.source, music.id);
		}

		//stop(); // 停止播放

		mediaHub&&mediaHub.switchTrack(music);
		rem.currentPlaying = music;

		fireEvent("play", music);

		$("#music-progress").addClass("loading");

		addHis(music); // 添加历史

		// 如果主界面是播放历史，那么还需要刷新
		refreshList();

		let a = rem.audio[0];
		a.src = url;
		a.play().then(function() {
			rem.errCount = -1;
			rem.audio.bar.lock(false);

			changeCover(music);
			lyricTip('加载中...');
			ajaxLyric(music, lyricCallback);
		}, audioErr);
	}

	// 停止播放
	function stop() {
		$("#music-progress").removeClass("loading load-fail");
		rem.errCount = 0;
		if(!rem.currentPlaying) return;
		//rem.idPlaying = -1;
		changeCover({pic: "err"});
		$("#player .lyric").empty();
		rem.audio[0].pause();
		rem.audio.bar.goto(0, true);
		rem.audio.bar.lock(true);
	}

	function sumProp(e) {
		let l = 0;
		while(e)
			l+=e.offsetLeft,
			e=e.offsetParent;
		return l;
	}

	// mk进度条插件
	// 进度条框 id，初始量，回调函数
	function mkpgb(bar, percent, callback, flag) {
		this.bar = $(bar);
		this.percent = percent;
		this.callback = callback;
		this.locked = false;
		this.init(flag == null ? 1 : flag);
	}

	mkpgb.prototype = {
		constructor: mkpgb,
		// 进度条初始化
		init: function(flag) {
			let mk = this;
			// 加载进度条html元素
			let $bar = mk.bar.addClass("mkpgb").html('<div class="bar bg"></div><div class="bar prog"></div><div class="dot"></div>');
			if(flag & 1) $bar.addClass("animated");
			if(flag & 2) $bar.find(".prog").remove();
			if(flag & 4) {
				$bar.on("mousedown", function(e) {
					let dot = $bar.find(".dot");
					if(mk.locked || e.target != dot[0]) return false;

					let pc = NaN, anim = $bar.hasClass("animated");
					let x = sumProp($bar[0]), w = $bar.width();

					$(window).once("mouseup", function() {
						$(window).unbind("mousemove", move);
						mk.dragging = false;
						if(pc == pc) {
							mk.callback(pc);
							mk.percent = pc;
						}
						anim&&$bar.addClass("animated");
					});
					$bar.removeClass("animated");

					$(window).on("mousemove", move);
					let prog = mk.bar.find(".prog");
					function move(e) {
						mk.dragging = true;

						F_DOM.stopEvent(e);
						let off = e.pageX-x;

						pc = off / w;
						if(pc < 0) pc = 0;
						else if(pc > 1) pc = 1;

						dot.css("left", (pc * 100) + "%");
						prog.css("width", (pc * 100) + "%");
					}
				});
			}

			$bar.on("mouseup", function(e) {
				if(e.button != undefined && e.button != 0) return;
				if (mk.locked || mk.dragging) return false;

				// 动画时间
				if(!mk.bar.hasClass("animated"))
					mk.bar.addClass("animated").delay(250).removeClass("animated");

				let pc = (e.pageX-sumProp($bar[0])) / $bar.width();
				if (pc < 0) pc = 0;
				else if (pc > 1) pc = 1;

				mk.goto(pc);
				return true;
			});

			mk.goto(mk.percent, true);

			return true;
		},
		// 跳转至某处
		goto: function(percent, skipCallback = false) {
			if(this.dragging) return false;
			if (percent > 1) percent = 1;
			if (percent < 0) percent = 0;
			this.percent = percent;
			this.bar.find(".dot").css("left", (percent * 100) + "%");
			this.bar.find(".prog").css("width", (percent * 100) + "%");
			if (!skipCallback) this.callback(percent);
			return true;
		},
		// 锁定进度条
		lock: function(islock) {
			if (islock) {
				this.locked = true;
				this.bar.addClass("locked");
			} else {
				this.locked = false;
				this.bar.removeClass("locked");
			}
			return true;
		}
	};

	let handlers = {};
	function fireEvent(name) {
		if (!handlers[name]?.length) return {};
		let cfg = Array.from(arguments);
		cfg[0] = {type: name};
		for (let h of handlers[name]) {
			try {
				h.apply(window, cfg);
			} catch (e) {
				console.error(e);
			}
		}
		return cfg[0];
	}
	function loadPlugin(m) {
		try {
			let cfg = m();
			if (cfg) {
				for(let k in cfg) {
					if (!handlers[k]) handlers[k] = [];
					handlers[k].push(cfg[k]);
				}
			}
		} catch (e) {
			console.error(e);
		}
	}

	function musicInList(list, msc) {
		let m3 = list.length != null ? list : musicList[list].item;
		for (let i = 0; i < m3.length; i++) {
			if (m3[i].id == msc.id && m3[i].source == msc.source) {
				return i;
			}
		}
		return -1;
	}

	let scrollNthSongId;
	function scrollNthSong(id) {
		scrollNthSongId&&scrollNthSongId();
		let $0 = $("#play-list");
		let h1 = $0.child(1).height();
		let dTop = $0.child(0).height() + 1 + (h1 + 1) * (id + 1);
		let viewportS = $0.scrollTop();
		let viewportH = $0.height() + viewportS;
		if(dTop + h1 < viewportS || dTop - h1 > viewportH) {
			dTop -= $0.height() / 2;
			if(dTop > $0.scrollHeight() - $0.height()) dTop = $0.scrollHeight() - $0.height();
			else if(dTop < 0) dTop = 0;
			scrollNthSongId = __animate($0, "scrollTop", dTop, 500);
		}
	}

	// 展现系统列表中任意首歌的歌曲信息
	function musicInfo(list, id) {
		let music = list.item[id];
		if (!music) {
			msg("歌曲不存在(原播放列表错误)").shake();
			return;
		}
		if(rem.listDisplay == rem.listPlaying) {
			scrollNthSong(id);
		}
		
		let html = '<span class="info-title">歌名：</span>' + music.name +
			'<br><span class="info-title">歌手：</span>' + music.artist +
			'<br><span class="info-title">专辑：</span>' + music.album;
		if (rem.audio[0].duration && rem.idPlaying == id && musicList[rem.listPlaying] == list)
			html += '<br><span class="info-title">时长：</span>' + formatTime(rem.audio[0].duration);
		html += '<br><span class="info-title">操作：</span>';
		html += '<span class="info-btn 1">去列表</span>';
		if(musicList[rem.listDisplay].my) {
			if (musicInList(rem.listDisplay, music) == -1) {
				html += '<span class="info-btn 2">加入当前列表</span>';
			} else {
				html += '<span class="info-btn 3">从当前列表删除</span>';
			}
		}
		html += '<br/><span class="info-btn 4">找专辑</span>&nbsp;&nbsp;&nbsp;<span class="info-btn 5">找歌手</span>';

		$.dialog({
			id: "MInf",
			title: false,
			btn: false,
			skin:"d-dark-msg",
			content: $("<div>").html(html).delegate("click", "span", function(e) {
				switch(this[0].classList[1]) {
					case '1':
						loadList(rem.listPlaying);
					break;
					case '2':
						addList(music, 0, rem.listDisplay);
					break;
					case '3':
						removeList(musicInList(rem.listDisplay, music), rem.listDisplay);
					break;
					case '4':
					case '5':
						rem.search = {
							type: this[0].classList[1] - 3, 
							wd: rem.currentPlaying
						};
						ajaxSearch();
					break;
				}
				$.dialog.get("MInf").close();
			})[0]
		});
	}

	// 搜索提交
	$(".s-btn").on("click", function searchSubmit(m) {
		let wd;
		if (rem.isMobile) {
			if (typeof(m) == "string") {
				wd = m;
			} else {
				$.dialog.prompt('请输入搜索词', searchSubmit, rem.wd || "");
				return false;
			}
		} else {
			wd = $("#search-wd").val();
			if (!wd) {
				msg('搜索内容不能为空').shake();
				$("#search-wd").focus();
				return false;
			}
		}

		rem.search = { wd: wd };
		ajaxSearch();
		return false;
	});

	// 移除
	function removeList(curId, selfId) {
		unRandom(selfId);
		let list = musicList[selfId].item;

		list.splice(curId, 1);

		if (selfId == 1)
			dataStore('playing', list);
		else if(selfId == 2) {
			dataStore('history', list);
		} else if (musicList[selfId].my)
			dataStore('custom_list', rem.customList);

		if (rem.listDisplay == selfId) {
			removeOne(curId,false);
		}
		if (rem.listPlaying == selfId) {
			rem.idPlaying = musicInList(selfId, rem.currentPlaying);
			if (rem.idPlaying < 0) stop();
		}
	}

	// 加入增在播放
	function addList(msc, addLastIfCan, selfId) {
		unRandom(selfId);
		let list = musicList[selfId = (arguments.length > 2 ? selfId : 1)].item;
		let cur = rem.currentPlaying;
		let curId;

		// 是否存在这首歌

		for (let i = 0; i < list.length; i++) {
			if (list[i].id == msc.id && list[i].source == msc.source) {
				return false;
			}
			if (addLastIfCan && cur && list[i].id == cur.id && list[i].source == cur.source) {
				curId = i;
			}
		}

		// 将这项追加到正在播放
		if (curId != undefined) {
			list.splice(curId + 1, 0, msc);
		} else {
			list.push(msc);
		}
		
		if (selfId == 1)
			dataStore('playing', list);
		else if(selfId == 2) {
			dataStore('history', list);
		} else if (musicList[selfId].my)
			dataStore('custom_list', rem.customList);

		if (rem.listDisplay == selfId) {
			loadList(selfId, 0);
		}

		return true;
	}

	// 改变右侧和背景图像
	function changeCover(music) {
		if (!music.pic) { // 封面为空
			ajaxPic(music, changeCover);
			return;
		}

		let img = music.pic;
		if (img == "err") {
			$("#music-cover,#sheet .sheet(0) img").attr('src', "images/player_cover.png");
			$("#blur-img").removeAttr('src');
		} else {
			if (config.mobileBg || !rem.isMobile) {
				clearTimeout(changeBgTimeout);
				changeBgTimeout = setTimeout(function() {
					$("#blur-img").attr('src', img).once("load", function() {
						$(this).fadeIn(800);
					});
				}, 800);
				$("#blur-img").fadeOut(800);
			}
			$("#music-cover,#sheet .sheet(0) img").attr('src', img);
		}
	}

	// 向列表中载入某个播放列表
	function loadList(list, flag) {
		if (musicList[list]._loading) {
			msg('列表读取中...');
			return false;
		}

		rem.listDisplay = list; // 记录当前显示的列表

		let play = $("#play-list").empty().append(rem.listHead);
		let mi = musicList[list].item;
		if (mi.length == 0) {
			addListbar("nodata", play); // 列表中没有数据

			if(flag === 1 || rem.dataBox == "list")
				dataBox("list"); // 在主界面显示
		} else {
			let i = 0;
			function step() {
				let len = Math.min(mi.length,i+100);

				let html = "";
				for (; i < len; i++) {
					html += addItem(i + 1, mi[i]);
				}
				play.append(html);

				if (len < mi.length) {
					setTimeout(step, 0);
					return;
				}

				// 列表加载完成后的处理
				if (list == 1 || list == 2 || (config.customClear && musicList[list].my)) {
					addListbar("clear", play);
				}

				if (rem.listPlaying !== undefined) {
					refreshList();
				}

				if(flag === 1 || rem.dataBox == "list")
					dataBox("list"); // 在主界面显示

				if (flag !== 0) // no reflow
					setTimeout(listToTop, 5);
			}
			step();
		}
	}

	// 播放列表滚动到顶部
	function listToTop() {
		let pl = $("#play-list");
		if(pl.scrollTop() != 0)
			__animate(pl, "scrollTop", 0, 500);
	}

	// 列表中新增一项
	// 参数：编号、名字、歌手、专辑
	function addItem(no, music, src) {
		return ('<div class="list">' +
			'<span class="num">' + no + '</span>' +
			'<span class="mobile-menu dot"></span>' +
			'<span class="name">' + music.name + '</span>' +
			'<span class="artist">' + music.artist + '</span>' +
			'<span class="album">' + music.album + '</span>' +
			'</div>');
	}

	// 加载列表中的提示条
	// 参数：类型（more、nomore、loading、nodata、clear）
	function addListbar(types, dest) {
		let html;
		switch (types) {
			case "more": // 还可以加载更多
				html = '<div class="list tc list-loadmore clickable" id="list-foot">点击加载更多...</div>';
				break;

			case "nomore": // 数据加载完了
				html = '<div class="list tc" id="list-foot">全都加载完了</div>';
				break;

			case "loading": // 加载中
				html = '<div class="list tc" id="list-foot">播放列表加载中...</div>';
				break;

			case "nodata": // 列表中没有内容
				html = '<div class="list tc" id="list-foot">可能是个假列表，什么也没有</div>';
				break;

			case "clear": // 清空列表
				html = '<div class="list tc list-clear clickable" id="list-foot">清空列表</div>';
				break;
		}
		(dest || $("#play-list")).append(html);
	}

	function removeOne(id, opList=true) {
		let list = musicList[rem.listDisplay].item;
		if (opList) list.splice(id, 1);
		if (rem.idPlaying >= id) rem.idPlaying--;
		$("#play-list .list")[id+1].remove();
		$("#play-list .list!.head .num").each((i, el) => el.innerText = i+1);

		if (rem.listDisplay == 1)
			dataStore('playing', list);
		else if(rem.listDisplay == 2) {
			dataStore('history', list);
		} else if (list.my)
			dataStore('custom_list', rem.customList);
	}

	function formatTime(time) {
		let h, m, s;

		h = parseInt(time / 3600);
		if (h < 10) h = '0' + h;

		m = parseInt((time % 3600) / 60);
		if (m < 10) m = '0' + m;

		s = parseInt(time % 60);
		if (s < 10) s = '0' + s;

		if (h > 0) {
			return h + ":" + m + ":" + s;
		} else {
			return m + ":" + s;
		}
	}

	// 在 ajax 获取了音乐的信息后再进行更新
	function updateMinfo(music) {
		if (!music.id) return false;
		if (music == rem.currentPlaying)
			mediaHub&&mediaHub.switchTrack(music);

		// 循环查找播放列表并更新信息
		for (let i = 0; i < musicList.length; i++) {
			let j = musicInList(i, music);
			if(j != -1) musicList[i].item[j] = music;
		}
	}

	// 刷新当前显示的列表，如果有正在播放则添加样式
	function refreshList() {
		let it = $("#play-list .list!.head").removeClass("playing");
		if (!rem.paused && rem.currentPlaying != null) {
			let l = musicList[rem.listDisplay];
			it.eq(musicInList(l.item, rem.currentPlaying)).addClass("playing");
		}
	}

	function listCopy(id, val) {
		rem.customList = rem.customList || {
			begin: musicList.length, 
			length: 0, 
			list: []
		};
		let begin = rem.customList.begin;
		let end = begin + rem.customList.length;

		let newList = {
			name: val, 
			cover: $("#music-cover").prop("src"), 
			my: 1
		};
		newList.item = Array.from(musicList[id].item);

		if(rem.listDisplay == 1)
			loadList(1);
		if(rem.listPlaying == 1)
			rem.listPlaying = end;
		rem.customList.length++;
		rem.customList.list.splice(end, 1, newList);
		musicList.splice(end, 0, newList);
		dataStore("custom_list", rem.customList);
		msg("已创建 " + val);

		loadSheets();
	}

	function listRename(id, val) {
		musicList[id].name = val;
		$("#sheet .sheet$data-no=" + id + " p").text(val);
		if(musicList[id].my)
			dataStore("custom_list", rem.customList);
	}

	function listRemove(id) {
		if(!rem.customList) return;

		let begin = rem.customList.begin;
		let end = begin + rem.customList.length;
		for(let i = begin; i < end; i++) {
			if(musicList[i].id == id) {
				msg("已删除 " + musicList[i].name);
				musicList.splice(i, 1);
				rem.customList.list.splice(i - begin, 1);
				if (!--rem.customList.length) {
					delete rem.customList;
				}
				dataStore("custom_list", rem.customList);
				loadSheets();
				return;
			}
		}
	}

	// 选择要显示哪个数据区
	// 参数：要显示的数据区（list、sheet、player）
	function dataBox(choice) {
		if (choice == "list") {
			if(!musicList[rem.listDisplay]) {
				loadList(rem.listDisplay = config.defaultList, 1);
				return;
			}
		}

		if (rem.dataBox != choice) {
			rem.dataBox = choice;

			$('.btn-box .active').removeClass('active');

			$("#play-list")[choice == "list" ? "fadeIn" : "fadeOut"](500);
			$("#sheet")[choice == "sheet" ? "fadeIn" : "fadeOut"](500);
			if($(window).width() <= 900)
				$("#player")[choice == "player" ? "fadeIn" : "fadeOut"](500);
			else $("#player").show();
		}

		let btn = $(".btn-box .btn." + choice).addClass('active');

		switch (choice) {
			case "list": // 播放列表
				btn.text(musicList[rem.listDisplay].name);
				break;

			case "player": // 播放器 [mobile only]
				// 立即滚动
				let time = lastLyric;
				lastLyric = -1;
				scrollLyric(time);
				break;
		}
	}

	// 将当前歌曲加入播放历史
	// 参数：要添加的音乐
	function addHis(music) {
		if (rem.listPlaying == 2) return true;
		unRandom(2);

		let mi = musicList[2].item;
		// 限定播放历史最多
		if (mi.length > config.historyMax) mi.length = config.historyMax;

		if (music.id !== undefined && music.id !== '') {
			// 检查历史数据中是否有这首歌，如果有则提至前面
			let i = musicInList(2, music);
			if(i != -1)
				mi.splice(i, 1);
		}

		// 再放到第一位
		mi.unshift(music);

		if(rem.listDisplay == 2)
			loadList(2, 3);

		dataStore('history', mi); // 保存播放历史列表
	}

	function userLogin() {
		$.dialog.prompt("请输入用户名", function(val) {
			if(!val.length) return false;
			dataStore("selfUser", val);
			ajaxMPUserList(val);
			$(".header .btn").text("欢迎回来，" + val);
		});
	}

	// 初始化播放列表
	function initList() {
		let uLog = dataRead('netease', false);
		// 登陆过，那就读取出用户的歌单，并追加到系统歌单的后面
		if (uLog) {
			rem.netease = uLog;
			let uList = dataRead('neteaseList'); // 读取本地记录的用户歌单

			if (uList) {
				musicList.push.apply(musicList, uList); // 追加到系统歌单的后面
				uLog = false;
			}
		}

		let mpUser = dataRead("selfUser");
		if (config.storageType == "local") {
			let playing = dataRead('playing');
			if (playing) {
				musicList[1].item = playing;
			}
			let history = dataRead('history');
			if (history) {
				musicList[2].item = history;
			}
		} else if (!mpUser) {
			ajaxMPUserList("null");
			config.autoShowLogin&&userLogin();
		} else {
			ajaxMPUserList(mpUser);
			$(".header .btn").text("欢迎回来，" + mpUser);
		}

		if (config.defaultList >= musicList.length) config.defaultList = 1;
		// 超出范围，显示正在播放列表
		else if(config.defaultList == -1) {
			dataBox("sheet");
			config.defaultList = 1;
		}

		// 显示所有的歌单
		let html = "";
		for (let i = 0; i < musicList.length; i++) {
			let list = musicList[i];
			if (i > 3 && !list.creatorID && (list.item == null || !list.item.length)) {
				list.item = [];
				if (list.id) {
					if(!list.lazyload) {
						// ajax获取列表信息
						ajaxPlayList(list);
					} else {
						list.creatorID = -1;
						if (!list.name) list.name = "未加载";
					}
				} else if (!list.name) {
					list.name = '未命名';
				}
			}

			if(!list.hidden) html += sheetHtml(i, list);
		}

		// 登陆了，但歌单又没有，刷新歌单
		if (uLog) ajaxUserList(uLog.id);

		if(config.defaultList != -1)
		var id = setInterval(function() {
			if (!musicList[config.defaultList]._loading) {
				loadList(config.defaultList);

				if (config.autoplay) {
					listClick(0);
				}
				clearInterval(id);
			}
		}, 200);

		// 登陆条
		$("#sheet").html(html + '<span id="sheet-bar"><div id="user-login" class="sheet-title-bar"></div></span>');
		sheetBar();
	}

	function loadSheets() {
		let html = "";
		let s = rem.customList ? rem.customList.begin : 0;
		let e = rem.customList ? s + rem.customList.length : 0;
		for (let i = 0; i < musicList.length; i++) {
			if(!musicList[i].hidden)
				html += sheetHtml(i, musicList[i], i >= s && i < e);
		}
		$("#sheet").html(html + '<span id="sheet-bar"><div id="user-login" class="sheet-title-bar"></div></span>');
		sheetBar();
	}

	function sheetBar() {
		$("#user-login").html(rem.netease ? '已同步 ' + rem.netease.name + ' 的网易歌单 <span class="login-refresh">[刷新]</span> <span class="login-out">[退出]</span>' : '我的网易歌单 <span class="login-in">[点击同步]</span>');
		$("#sheet").append($("#sheet-bar"));
	}

	function sheetHtml(i, music, del) {
		return '<div data-no="' + i + '" class="sheet"><img src="' + (
			music.cover || "images/player_cover.png"
		) + '"><p>' + music.name + '</p>' + (del ? '<span class="remove" title="删除"></span>' : '') + '</div>';
	}

	// 清空用户的同步列表
	function clearNeteaseList(flag) {
		if (!rem.netease) return false;

		// 查找用户歌单起点
		let s = 4;
		for (; s < musicList.length; s++) {
			if (musicList[s].creatorID == rem.netease.id) break;
		}
		let i = s;
		for (; i < musicList.length; i++) {
			if (musicList[i].creatorID != rem.netease.id) break; // 找到了就退出
		}

		// 删除记忆数组
		musicList.splice(s, i - s + 1);

		if(flag)
			delete rem.netease;
		else
			ajaxUserList(rem.netease.id);

		loadSheets();

		if(rem.listPlaying >= s)
			if(rem.listPlaying < i)
				rem.listPlaying = null;
			else
				rem.listPlaying--;
	}

	// 播放器本地存储信息
	// 参数：键值、数据
	function dataStore(key, data) {
		if (config.storageType == "web" && (key == "playing" || key == "history" || key == "custom_list")) {
			ajaxSaveUserList(dataRead("selfUser", "null"), key, data);
			return;
		}
		key = 'mkPlayer2_' + key;
		// 存储，IE6~7 不支持HTML5本地存储
		if (window.localStorage) {
			if(data == null) {
				localStorage.removeItem(key);
				return;
			}
			data = JSON.stringify(data);
			localStorage.setItem(key, data);
		}
	}

	// 播放器读取本地存储信息
	// 参数：键值
	// 返回：数据
	function dataRead(key, def) {
		if (!window.localStorage) return def;
		key = 'mkPlayer2_' + key;
		try {
			return localStorage.getItem(key) !== null ? JSON.parse(localStorage.getItem(key)) : def;
		} catch(e) {
			localStorage.removeItem(key);
			return def;
		}
	}

	/***********
	 * Ajax模块
	 ***********/

	function ajaxMPUserList(user) {
		let id = $.dialog.loading('请求用户数据');

		musicList[1]._loading = 
		musicList[2]._loading = true;

		$.ajax({
			method: "POST",
			url: config.api,
			data: "types=userSong&type=get&user=" + user,
			dataType: "json",
			complete: function(xhr, st) {
				id && id.close();
			},
			success: function(json) {
				musicList[1].item = json.playing.push ? json.playing : [];
				musicList[2].item = json.history.push ? json.history : [];
				delete musicList[1]._loading;
				delete musicList[2]._loading;
				
				if (rem.listDisplay == 1 || rem.listDisplay == 2)
					loadList(rem.listDisplay);
				if(rem.customList != null)
					musicList.splice(rem.customList.begin, rem.customList.length);
				let ml = rem.customList = json.custom_list || null;
				if(ml != null) {
					musicList.splice.apply(musicList, [ml.begin, 0].concat(ml.list));
				}
				loadSheets();
			},
			error: function(xhr, st, err) {
				ajaxErr(xhr, st, err, '用户数据');
			}
		});
	}

	function ajaxSaveUserList(user, key, val) {
		let data = {};
		data.user = user, 
		data[key] = encodeURIComponent(JSON.stringify(val));

		$.ajax({
			method: "POST",
			url: config.api + "?types=userSong&type=save",
			data: data,
			dataType: "json",
			error: function(xhr, st, err) {
				ajaxErr(xhr, st, err, '自动保存');
			}
		});
	}

	// ajax加载搜索结果
	function ajaxSearch() {
		let arr = rem.search;

		if (arr.end) {
			msg('没有更多了').shake();
			addListbar("nomore");
			return false;
		}

		let s = '缺少必须的数据以完成该操作';
		if (!arr || !arr.wd) {
			msg(s).shake().time(2000);
			return false;
		}

		if (!arr.page) { // 弹出搜索提示
			arr.page = 1;
		}

		let p = {
			types: 'search', 
			page: arr.page, 
			limit: config.perPage
		};
		switch (p.kind = arr.type||0) {
			case 0: // name
				p.source = rem.source;
				p.name = arr.wd;
				break;
			case 1: // album
				p.source = arr.wd.source;
				p.name = arr.wd.album_id;
				break;
			case 2: // artist
				p.source = arr.wd.source;
				if (!arr.wd.artist_ids) {
					msg(s);
					return;
				}
				p.name = arr.wd.artist_ids[0];
				break;
		}

		if (!p.name) {
			msg(s).shake().time(2000);
			return;
		}

		let w = $.loading('搜索中');
		$.ajax({
			method: "POST",
			url: config.api,
			data: p,
			dataType: "json",
			complete: () => w.close(),
			success: function(data) {
				if (data.desc) $.dialog({content:$("<div>").text(data.desc)[0]});

				data = data.items;

				if (arr.page == 1) {
					if (!data.length) {
						arr.end = true;
						msg('没有找到相关歌曲').shake();
						return false;
					}

					musicList[0].item = [];
					$("#play-list").empty().append(rem.listHead);
					rem.listDisplay = 0; // 当前显示的是搜索列表
					dataBox("list"); // 在主界面显示出播放列表
				} else {
					$("#list-foot").remove();
					//加载后面的页码，删除“加载更多”
				}

				let pl = $("#play-list");
				let m0 = musicList[0].item;
				for (let i = 0; i < data.length; i++) {
					let ti = processSong(data[i]);
					pl.append(addItem(m0.push(ti), ti));
				}

				refreshList(); // 刷新列表，添加正在播放样式
				addListbar((arr.end = data.length != config.perPage) ? "nomore" : "more");
				// 没加载满，说明已经加载完了

				if (arr.page++ == 1) listToTop();
				// 第一页就滚动到顶部
			},
			error: function(xhr, st, err) {
				ajaxErr(xhr, st, err, '搜索');
			}
		});
	}

	function processSong(ti) {
		if(typeof(ti.album) != "string") {
			let pic = ti.album.pic;
			if (pic&&!pic.includes("?")) pic += config.picSize;
			ti.pic = pic;
			ti.pic_id = ti.album.pic_id;
			ti.album_id = ti.album.id;
			ti.album = ti.album.name;

			let ar = "", arids = [];
			for (let i in ti.artist) {
				ar += ti.artist[i].name + " & ";
				arids.push(ti.artist[i].id);
			}
			ar = ar.substring(0, ar.length - 3);

			ti.artist_ids = arids;
			ti.artist = ar;
		} else if (ti.f) {
			if (ti.f == 2) ti.lyric_id = ti.id;
			delete ti.f;

			ti.source = "file";
			ti.url = config.api+"?p="+ti.id+'&e='+ti.url;
			if (ti.pic)
				ti.pic = config.api+"?p="+ti.id+'&e='+ti.pic;
			else
				ti.pic = "err";
		}
		return ti;
	}

	// 获取音乐信息
	// 音乐data、回调函数
	function ajaxUrl(music, cb) {
		// id为空，赋值链接错误。直接回调
		if (music.id == null) {
			music.url = "err";
			updateMinfo(music);
			cb&&cb(music);
			return true;
		}

		$.ajax({
			method: "POST",
			url: config.api,
			data: "types=url&id=" + music.id + "&source=" + music.source + (!cache ? "" : "&c=1") + "&cache=" + songName(music),
			dataType: "json",
			success: function(json) {
				// 调试信息输出
				if (!(music.url = json.url)) {
					msg('链接获取失败!');
					music.url = "err";
				}

				updateMinfo(music);
				cb&&cb(music);
				return true;
			},
			error: function(xhr, st, err) {
				ajaxErr(xhr, st, err, '歌曲链接');
			}
		});
	}

	// 完善获取音乐封面图
	// 包含音乐信息的数组、回调函数
	function ajaxPic(music, cb) {
		if (music.pic_id == null) {
			music.pic = "err";
			updateMinfo(music);
			cb&&cb(music);
			return true;
		}

		$.ajax({
			method: "POST",
			url: config.api,
			data: "types=pic&id=" + music.pic_id + "&source=" + music.source + (!cache ? "" : "&c=1") + "&cache=" + songName(music),
			dataType: "json",
			success: function(json) {
				music.pic = json.url||"err";

				updateMinfo(music);
				cb&&cb(music);
				return true;
			},
			error: function(xhr, st, err) {
				ajaxErr(xhr, st, err, '歌曲封面');
			}
		});
	}

	// ajax加载用户歌单
	// todo 支持其他地方的歌单
	// 参数：歌单，回调
	function ajaxPlayList(list, cb) {
		if (!list) return false;

		// 已经在加载
		if (list._loading) return true;
		list._loading = true;

		let id = musicList.indexOf(list);
		$("#sheet .sheet$data-no='"+id+"' p").html('读取中...');

		$.ajax({
			method: "POST",
			url: config.api,
			data: "types=playlist&id=" + list.id + "&source=" + (list.source || "netease"),
			dataType: "json",
			complete: function() { delete list._loading; },
			success: function(json) {
				if (!json || json.charAt) {
					console.log(json);
					msg("歌单"+list.id+"读取失败").shake();
					$("#sheet .sheet$data-no='"+id+"' p").html('<span style="color:#EA8383">读取失败</span>');
					return;
				}

				// 存储歌单信息
				list.name = json.name;
				if (json.image)
					list.cover = json.image + config.picSize;
				list.creator = json.creator;
				list.item = [];

				let tracks = json.items;
				if (tracks&&tracks.length) {
					// 处理并存储歌单中的音乐
					list.item = tracks;
					for (let i = 0; i < tracks.length; i++) {
						tracks[i] = processSong(tracks[i]);
					}
				}

				if (rem.netease && list.creatorID === rem.netease.id) {
					// 是当前登录用户的歌单，要保存到缓存中
					let stored = dataRead('neteaseList'); // 读取本地记录的用户歌单
					if (stored) { // 读取到了
						for (let i = 0; i < stored.length; i++) { // 匹配歌单
							if (stored[i].id == list.id) {
								stored[i] = list; // 保存歌单中的歌曲
								dataStore('neteaseList', stored); // 保存
								break;
							}
						}
					}
				}

				delete list._loading;
				cb&&cb(id, 1);

				// 改变前端列表
				$("#sheet .sheet$data-no='"+id+"' img").attr('src',list.cover); // 专辑封面
				$("#sheet .sheet$data-no='"+id+"' p").html(list.name); // 专辑名字
			},
			error: function(xhr, st, err) {
				ajaxErr(xhr, st, err, '歌单');
				$(".sheet$data-no='"+id+"' p").html('<span style="color:#EA8383">读取失败</span>');
			}
		});
	}

	// ajax加载歌词
	// 参数：音乐ID，回调函数
	function ajaxLyric(music, cb) {
		if (!music.lyric_id) {
			cb&&cb('',music.lyric_id); // 没有歌词
			delete music.lyric_id;
			return;
		}

		$.ajax({
			method: "POST",
			url: config.api,
			data: "types=lyric&id="+music.lyric_id+"&source="+music.source+(cache?"&c=1":"") + "&cache="+songName(music),
			dataType: "json",
			success: function(json) {
				if (!cb) return;
				// 回调函数
				if (json.lyric) {
					cb(json.lyric, music.lyric_id, json.tlyric||null);
				} else {
					cb('', music.lyric_id);
					delete music.lyric_id;
				}
			},
			error: function(xhr, st, err) {
				ajaxErr(xhr, st, err, '歌词');
				cb(err,music.lyric_id,'err');
			}
		});
	}

	let forbidName = {"\\": 1, "/": 1, "?": 1, "*": 1, "\"": 1, ">": 1, "<": 1, "|": 1};
	// 拼接歌曲名字
	function songName(music, noEncode) {
		let name = music.name + " - " + music.artist + (music.album == music.name ? "" : " - " + music.album);

		if(name.length > 100) {
			name = name.substring(0, 100);
		}

		for(let i = 0; i < name.length; i++)
			if(forbidName[name.charAt(i)]) {
				name = name.substring(0, i) + name.substring(i + 1);
			}

		return noEncode ? name : encodeURIComponent(name);
	}

	// ajax加载用户的播放列表
	// 参数 用户的网易云 id
	function ajaxUserList(uid) {
		let load = $.dialog.loading('请求网易歌单');
		$.ajax({
			method: "POST",
			url: config.api,
			data: "types=userlist&uid=" + uid,
			dataType: "json",
			complete: function(xhr, st) {
				load.close();
			},
			success: function(json) {
				if (json.code == "-1" || json.code == 400) {
					msg('用户 uid 输入有误').shake();
					return false;
				}
				let pl = json.playlist;
				if (!pl.length) {
					msg('没找到用户 ' + uid + ' 的歌单').shake();
					return false;
				} else {
					if(!pl[0].creator) {
						msg('不支持的用户数据 ' + pl[0].creator).shake();
						return false;
					}
					rem.netease = {
						id: uid, 
						name: pl[0].creator.nickname
					}

					// 第一个列表(喜欢列表)的创建者即用户昵称
					msg('欢迎您 ' + rem.netease.name);
					// 记录登录用户

					dataStore('netease', rem.netease);

					let userList = [];
					for (let p of pl) {
						// 获取歌单信息
						let entry = {
							id: p.id,
							name: p.name, // 列表名字
							cover: p.coverImgUrl + "?param=300y300", // 列表封面
							creatorID: uid, // 列表创建者id
							creator: {
								name: p.creator.nickname, 
								head: p.creator.avatarUrl
							},
							item: []
						};
						userList.push(entry);
						// 存储并显示播放列表
						$("#sheet").append(sheetHtml(musicList.push(entry) - 1, entry));
					}
					dataStore('neteaseList', userList);
					// 显示退出登录的提示条
					sheetBar();
				}

				console.debug("网易歌单获取成功", uid);
			},
			error: function(xhr, st, err) {
				ajaxErr(xhr, st, err, '网易歌单');
			}
		});
		return true;
	}

	/***********
	 * 歌词模块
	 ***********/
	let lyricArea = $(".lyric"); // 歌词容器
	let stopLyric = null;   // interval id
	let lastScroll = 0;

	lyricArea.on(rem.isMobile ? "click" : "dblclick", function(e) {
		if(e.button && e.button != 0) return false;

		document.getSelection().empty();

		let i = lyricArea.find("li").index(e.target);
		i = rem.lyric[i][0];
		rem.audio[0].currentTime = i;
		refreshLyric(i);
		return false;
	}).on("wheel", function(e) {
		stopLyric&&stopLyric();
		lastScroll = Date.now();
	}, null, {passive:true});

	// 在歌词区显示提示语
	function lyricTip(str) {
		lyricArea.html("<li class='tip'>"+str+"</li>");
	}

	// 歌曲加载完后的回调函数
	// 参数：歌词源文件
	function lyricCallback(str, id, tlyric) {
		stopLyric&&stopLyric();

		// 返回的歌词不是当前这首歌的
		if (!rem.currentPlaying || id != rem.currentPlaying.lyric_id) {
			return;
		}

		if (tlyric == 'err') {
			lyricTip('加载失败: ' + str);
			return;
		}

		rem.lyric = str = parseLyric(str);
		if (!str || !str.length) {
			lyricTip('没有歌词');
			return false;
		}

		if(tlyric && (tlyric = parseLyric(tlyric)) && tlyric.length) {
			for (let lrc of tlyric) {
				if (!lrc[1]) continue;
				let id = binarySearch(lrc[0],str);
				if (id < 0) {
					id = -id - 1;
					str.splice(id, 0, [lrc[0], "<null>", lrc[1]]);
				} else {
					str[id].push(lrc[1]);
				}
			}
			lyricArea.addClass("higher");
		} else {
			lyricArea.removeClass("higher");
		}

		// 221206 无语，还有人不按顺序排歌词
		str.sort((a,b) => a[0]-b[0]);

		lastLyric = -1;

		let html = "";
		for (let k in str) {
			let o = str[k];
			o = o[1] + (o[2] ? "<span>"+o[2]+"</span>" : "");
			html += "<li>" + (o||"&nbsp;") + "</li>";
		}
		lyricArea.html(html).scrollTop(0);
	}

	// 强制刷新当前时间点的歌词
	// 参数：当前播放时间（单位：秒）
	function refreshLyric(i) {
		lastScroll = 0;
		return scrollLyric(i);
	}

	// 滚动歌词到指定句
	// 参数：当前播放时间（单位：秒）
	function scrollLyric(i) {
		if (!rem.lyric) return false;

		i = binarySearch(i,rem.lyric);
		if (i < 0) i = -i - 2;
		if (i < 0) return false;

		if (lastLyric == i) return true; // 歌词没发生改变
		lastLyric = i; // 记录方便下次使用

		let h = lyricArea.find("li").removeClass("play").eq(i).addClass("play").height(); // 加上正在播放样式

		if (Date.now() - lastScroll < 2000) return true;

		let scroll = (h * (i + 1)) - (lyricArea.height() / 2);

		stopLyric&&stopLyric();
		stopLyric = __animate(lyricArea, 'scrollTop', scroll, 700);

		return true;
	}

	function binarySearch(key, a) {
		let l = 0, h = a.length - 1;

		while (l <= h) {
			let m = (l + h) >>> 1;
			let midVal = a[m][0] - key;

			if (midVal < 0) {
				l = m + 1;
			} else if (midVal > 0) {
				h = m - 1;
			} else return m;
		}

		return -(l + 1);
	}

	// 解析歌词
	function parseLyric(lrc) {
		if (!lrc) return false;
		lrc = lrc.split("\n");

		let lrcObj = [];
		let off = 0;
		let timeExpr = /\[(\d*):(\d*[.:]\d*)*]/g;
		for (let i = 0; i < lrc.length; i++) {
			let lyric = unescape(lrc[i]), A, B;

			if (A = lyric.match(timeExpr)) {
				B = lyric.replace(timeExpr, '');

				for (let j = A.length-1; j >= 0; j--) {
					let t = timeExpr.exec(A[j]);
					if (!t) continue;

					let time = Number(t[1]) * 60 + Number(t[2].replace(":",".")) + off;
					lrcObj.push([time,B]);
				}
			} else if (A = /\[(.+?):(.+?)](.*?)$/.exec(lyric)) {
				if (A[0] == "offset") {
					off = Number(A[1]) / 1000;
					if (off != off) off = 0;
				}
			}
		}

		return lrcObj;
	}

	const T = Math.floor(1000 / 60);
	let requestAnimationFrame = window.requestAnimationFrame||(function(cb) {
		setTimeout(cb, T);
	});

	function __animate(elm, prop, to, time) {
		let v = elm[prop]();
		let step = (to - elm[prop]()) / (time / T);
		if(Math.abs(step) < 1)
			step = Math.sign(step) || 1;
		let sig = Math.sign(step);

		let fn = function() {
			if(Math.sign(to-v) != sig || v == to) {
				elm[prop](to);
				return;
			}
			elm[prop](v+=step);
			fn&&requestAnimationFrame(fn);
		};
		fn();

		return function() { fn = null; };
	}

	Object.prototype.compareTo = function(b) {
		if (this<b) return -1;
		if (this>b) return 1;
		return 0;
	};
	$.callOnly(Object.prototype, ["compareTo"]);

	function pysorter(ret) {
		return fireEvent("sorter", ret).sorter || ((a, b) => ret(a).compareTo(ret(b)));
	}

	/**
	 * 初始化
	 */
	rem.isMobile = isMobile.any(); // 判断是否是移动设备
	if (rem.isMobile) {
		$("#search-wd")[0].required = false;
	}
	rem.webTitle = document.title; // 记录页面原本的标题
	rem.errCount = -1; // 记录连续播放失败的歌曲数
	rem.order = dataRead("order", 2);

	rem.audio = $('<audio>')/*.attr("crossOrigin", "anonymous")*/.appendTo('body')
	.on("timeupdate", function(a) {
		a=a.target;

		// 暂停
		if (rem.paused !== false) return;

		//AB复读
		if (rem.repeatB!=null && a.currentTime >= rem.repeatB) {
			a.currentTime = rem.repeatA||0;
		}

		let sec = Date.now();

		let last = lastProgress;
		// 2021 / 1 / 23 降低CPU占用率
		if (sec - last > 200) {
			mediaHub&&mediaHub.updatePos();

			lastProgress = sec;

			// 同步进度条
			let pc = a.currentTime / a.duration;
			rem.audio.bar.goto(pc, true);

			if((rem.order == 0 || rem.order == 2 || rem.listPlaying == 3) && 
			pc > config.preloadPercent && rem.prefetch.cacheId != rem.idPlaying) {
				rem.prefetch[0].muted = true;

				let music = musicList[rem.listPlaying].item[rem.idPlaying + 1];
				if(music) {
					function noUrl() {
						ajaxUrl(music, function(music) {
							rem.prefetch.attr("src", music.url);
						});
					}
					if(music.url)
					rem.prefetch.attr("src", music.url)[0].play().then(function() {
						try {
							rem.prefetch[0].playbackRate = 16;
						} catch (e) {}
					}, noUrl);
					else noUrl();
					rem.prefetch.cacheId = rem.idPlaying;
				} else
					rem.prefetch.cacheId = -1;
			}
		}
		// 同步歌词显示
		scrollLyric(a.currentTime);
	}).on("play", function() {
		mediaHub&&mediaHub.pause(0);
		rem.paused = false;
		refreshList(); // 刷新状态，显示播放的波浪
		$(".btn-play").addClass("state"); // 显示暂停的图片

		$("#sheet .sheet$data-no=" + rem.listPlaying).addClass("playing");

		if ((config.dotShine & 1) != 0 || (rem.isMobile && (config.dotShine & 2) != 0)) {
			$("#music-progress .dot").addClass("move");
		}

		let music = rem.currentPlaying || {};
		document.title = music.name + " - " + music.artist + " | " + rem.webTitle;
	}).on("pause", function() {
		mediaHub&&mediaHub.pause(1);
		rem.paused = true;
		$(".playing").removeClass("playing"); // 移除正在播放
		$(".btn-play").removeClass("state");
		$("#music-progress .move").removeClass("move"); // 小点闪烁效果

		document.title = rem.webTitle;
	}).on("ended", function() {
		if (rem.errCount > 1) { // 连续播放失败
			return;
		}

		//AB复读 part2
		if (rem.repeatA!=null&&rem.repeatB==null) {
			this.currentTime = rem.repeatA;
			this.play();
			return;
		}
		
		if (rem.order === 1) {
		} else if(rem.listPlaying != 0 || config.autoPlaySearch) { // 搜索结果不自动播放
			if((rem.listPlaying != 3 && rem.order != 0) || rem.idPlaying != musicList[rem.listPlaying].item.length - 1) {
				nextMusic();
				return;
			}
		}
	}).on("canplay", function() {
		$("#music-progress").removeClass("loading");
	}).on("seeking", function() { // 跳位置了
		$("#music-progress").addClass("loading");
	}).on('error', audioErr); // 播放器错误处理

	if(config.showBuffer) {
		rem.bufferUpdater = setInterval(function() {
			let ado = rem.audio[0];
			if(!ado.src) return;
			let tr = ado.buffered;
			let elms = $("#music-progress .load");
			if(elms.length > tr.length) {
				for(let i = elms.length - 1; i >= tr.length; i--)
					elms[i].remove();
				elms = $("#music-progress .load");
			} else if(elms.length < tr.length) {
				let mp = $("#music-progress");
				for(let i = elms.length; i < tr.length; i++)
					mp.append($("<div class='bar load'></div>"));
				elms = $("#music-progress .load");
			}
			if(!tr.length) return;
			let tot = ado.duration;
			for(let i = 0; i < tr.length; i++) {
				let s = tr.start(i), e = tr.end(i);
				elms.eq(i).css({left: (100 * s / tot)  + "%", width: (100 * (e - s) / tot) + "%"});
			}
		}, 333);
	}

	rem.prefetch = $('<audio>').appendTo('body').attr("preload", "auto");

	// 初始化音量设定
	if (dataRead('muted')) $(".btn-quiet").addClass("state"); // 添加静音样式
	let vol = dataRead('volume', config.volume);
	if (vol < 0) vol = 0;
	if (vol > 1) vol = 1;
	// 应用初始音量
	rem.audio[0].volume = vol;

	rem.audio.volume = new mkpgb("#volume-progress", vol, (val) => {
		rem.audio[0].volume = val;
		$(".btn-quiet").removeClass('state');
		dataStore("muted");
		dataStore('volume', val);
		$.dialog({id:"Vol",title:!1,cancel:!1,content:(val*100)+"%",time:1e3,skin:"d-dark-msg"});
	}, 5);

	// 静音按钮点击事件
	$(".btn-quiet").on("click", function(e) {
		let muted = $(e.target).toggleClass('state').hasClass('state');
		dataStore('muted', rem.audio[0].muted = muted ? 1 : null);
	});

	// 初始化播放进度条
	(rem.audio.bar = new mkpgb("#music-progress", 0, function(val) {
		let newTime = rem.audio[0].duration * val;
		rem.audio[0].currentTime = newTime;
		refreshLyric(newTime);
	}, 4)).lock(true);

	updateOrder();

	if(false === dataRead('volume')) {
		$.dialog('输入 <span style="color:red;">..</span> 打开高级菜单').time(8000);
	}

	var tRight = 0;

	let dot = false;
	$(document)
	.on("keyup", function(e) {
		switch (e.key.toLowerCase()) {
			case 'arrowright':
				if (tRight > 0) {
					clearTimeout(tRight);
					tRight = 0;
					nextMusic(1);
				} else {
					rem.audio[0].playbackRate = 1;
					$.dialog.get("Load")?.close();
				}
				break;
		}
	})
	.on("keydown", function(e) {
		if (e.target.nodeName == "INPUT") return;
		switch (e.key.toLowerCase()) {
			case '{':
				if (e.repeat) return;
				rem.repeatA = null;
				msg("["+0+" => "+(rem.repeatB||rem.audio[0].duration)+"]");
				return;
			case '}':
				if (e.repeat) return;
				rem.repeatB = null;
				msg("["+(rem.repeatA||0)+" => "+(rem.audio[0].duration)+"]");
				return;
			case '[':
				if (e.repeat) return;
				rem.repeatA = rem.audio[0].currentTime;
				msg("["+(rem.repeatA||0)+" => "+(rem.repeatB||rem.audio[0].duration)+"]");
				return;
			case ']':
				if (e.repeat) return;
				rem.repeatB = rem.audio[0].currentTime;
				msg("["+(rem.repeatA||0)+" => "+(rem.repeatB||rem.audio[0].duration)+"]");
				return;
			case 'f':
				$.prompt("搜索内容", function(val) {
					if (!val) return false;
					let arr = musicList[rem.listDisplay]?.item;
					if (!arr) return;
					val = val.toLowerCase();
					let html = $("<ul>").css({"max-height":"768px","overflow":"scroll"});
					for(let i=0;i<arr.length;i++) {
						let song = arr[i];
						if (song.album.toLowerCase().includes(val) || 
								song.artist.toLowerCase().includes(val) || 
								song.name.toLowerCase().includes(val)) {
							$("<a>").text(songName(song, 1))
							.on("click", scrollNthSong.bind(this, i))
							.on("dblclick", listClick.bind(this, i))
							.appendTo($("<li>").appendTo(html));
						}
					}
					$.dialog({
						title: "搜索结果 (单击查看 双击播放)", 
						content: html[0], 
						lock: false
					});
				});
				F_DOM.stopEvent(e);
				return;
			case 'arrowleft':
				if (e.repeat) return;
				nextMusic(-1); return;
			case 'arrowright':
				if (e.repeat) return;
				tRight = setTimeout(() => {
					rem.audio[0].playbackRate = 3;
					$.dialog.loading("倍速快进中");
					tRight = -1;
				}, 500);
				return;
			case 'arrowup': 
				rem.audio.volume.goto(rem.audio[0].volume + 0.1);
				F_DOM.stopEvent(e);
				return;
			case 'arrowdown':
				rem.audio.volume.goto(rem.audio[0].volume - 0.1);
				F_DOM.stopEvent(e);
				return;
			case " ":
				if (e.repeat) return;
				pause();
				F_DOM.stopEvent(e);
				return;
			case "m":
				if (e.repeat) return;
				cylOrder();
				return;
			default: 
				dot = false;
				return;
			case '.':
				if (!dot) {
					dot=true;
					return;
				}
		}
		let elm = $("<div>").html('\
		<span class="info-btn 1">停止</span>&nbsp;&nbsp;\
		<span class="info-btn 2">清缓存</span>&nbsp;&nbsp;\
		<span class="info-btn 3">下一首列表</span>&nbsp;&nbsp;\
		<span class="info-btn 4">按名称整理列表</span>&nbsp;&nbsp;<br/>\
		<span class="info-btn 5">导出/导入正在播放</span>&nbsp;&nbsp;\
		<span class="info-btn 6">触屏模式</span>&nbsp;&nbsp;\
		<span class="info-btn 7">定时播放</span>&nbsp;&nbsp;<br/>\
		<span class="info-btn 8">按歌手整理列表</span>&nbsp;&nbsp;\
		<span class="info-btn 9">按专辑整理列表</span>')
		.delegate("click", "span", function(e) {
			switch(e.target.classList[1]) {
				case '1':
					stop();
				break;
				case '2':
					for(let i = 0; i < musicList.length; i++) {
						let ml = musicList[i].item;
						for(let j = 0; j < ml.length; j++) {
							ml[j].pic = "";
							ml[j].url = "";
						}
					}
					msg("OK");
				break;
				case '3':
					loadList(3);
				break;
				case '4':
					musicList[rem.listDisplay].item.sort(pysorter((a) => a.name));
					loadList(rem.listDisplay);
				break;
				case '5':
					let elm = $("<textarea style='resize:none;' cols=150 rows=15></textarea>").val(JSON.stringify(musicList[1].item));
					$.dialog({
						id: "Export",
						title: "正在播放导出/导入",
						content: elm[0],
						button: [{
							id: "ok", 
							value: '导入', 
							callback: function() {
								unRandom(1);
								if (rem.listPlaying == 1) {
									stop();
								}
								try {
									dataStore("playing", musicList[1].item = JSON.parse(elm.val()));
								} catch (e) {
									msg("数据有误: " + e).shake();
									return false;
								}
							}
						}]
					});
				break;
				case '6':
					if(localStorage) {
						let mb = localStorage.getItem("mobile");
						localStorage[mb == null ? 'setItem' : 'removeItem']("mobile", 1);
						msg(mb == null ? "已开" : "已关");
						setTimeout(function() { location.href = location.href; }, 1000);
					}
				break;
				case '7':
				if(rem.delay) {
					clearTimeout(rem.delay);
					delete rem.delay;
					msg("已清除");
				} else {
					let dlg = $.dialog.prompt('When? eg 14:00:00.000', function(val) {
						if(!val.length)
							return false;
						val = val.split(':');
						if(val.length != 3)
							return dlg.shake(), false;
						let dt = new Date();
						dt.setHours(val[0]);
						dt.setMinutes(val[1]);
						val = val[2].split('.');
						dt.setSeconds(val[0]);
						dt.setMilliseconds(val.length > 1 ? val[1] : 0);
						dt = dt.getTime() - Date.now();
						if(dt <= 0)
							return console.log(dt), dlg.shake(), false;

						rem.delay = setTimeout(function () {
							pause();
							delete rem.delay;
						}, dt);
					});
				}
				break;
				case '8':
					musicList[rem.listDisplay].item.sort(pysorter((a) => a.artist));
					loadList(rem.listDisplay);
				break;
				case '9':
					musicList[rem.listDisplay].item.sort(pysorter((a) => a.album));
					loadList(rem.listDisplay);
				break;
			}
		});
		$.dialog({
			id: "adv",
			title: "高级功能",
			content: elm[0]
		});
	});

	cache = dataRead("cache", 0);

	// removed: 使用webkit滚动条

	rem.listHead = $('<div class="list head">' +
		'<span class="name">歌曲</span>' +
		'<span class="artist">歌手</span>' +
		'<span class="album">专辑</span>' +
		'</div>');

	$("#play-list").empty().append(rem.listHead);
	addListbar("loading"); // 列表加载中

	// 顶部按钮点击处理
	$(".btn-box .btn").on("click", function() {
		dataBox(this.classList[1]);
	});

	$(".search .site").on("focus", function() {
		$(".search .list").addClass("open");
	});

	$(".search .list li").on("click", function() {
		rem.source = $(this).data("source");
		$(".search .list").removeClass("open");
		$(".search .site").css("background-position-x", (-23 * $(".search .list li").index(this)) + "px");
		rem.wd = "";
	});

	// 歌曲右键菜单
	$("#song_menu").delegateChild("mousedown", "li", function(e, index) {
		let music = musicList[rem.listDisplay].item[rem.menuClick];
		switch(index = index()) {
			case 0:
				function cb(music) {
					if (music.url == 'err' || music.url == "" || music.url == null) {
						msg('这首歌不支持下载').shake();
						return;
					}
					// ...
					let a = $('<a>').attr({"target": "_blank", "download": songName(music, 1) + ".mp3", "href": music.url}).appendTo("body");
					// 同源请求
					if(a[0].origin == location.origin) {
						a[0].click();
						a.remove();
					} else {
						$.ajax({
							url: music.url, 
							responseType: "blob", 
							success: function(blob, st) {
								a[0].href = window.URL.createObjectURL(blob);
								a[0].click();
								a.remove();
							}
						});
					}
				}
				if(music == rem.currentPlaying)
					cb(music);
				else
					ajaxUrl(music, cb);
			break;
			case 1: // 离线
				if(music.source == "file") {
					msg("本地歌曲, 无需离线");
					break;
				}
				let oc = cache;
				cache = 1;
				delete music.url;
				delete music.pic;
				ajaxUrl(music);
				ajaxLyric(music);
				ajaxPic(music);
				cache = oc;
				msg("离线完成");
			break;
			case 2:
			case 3:
				rem.search = {
					wd: rem.currentPlaying,
					type: index-1
				};
				ajaxSearch();
			break;
			case 4:
				musicInfo(musicList[rem.listDisplay], rem.menuClick);
			break;
			case 5:
				$.confirm("确认删除 ", function() {
					if (music.source == "file") {
						$.ajax({
							method: "POST",
							url: config.api,
							data: "types=phy_del&id=" + music.id,
							success: (text) => msg(text).time(10000)
						});
					}
					removeOne(rem.menuClick);
				});
			break;
		}
	});

	rem.menu = document.createElement("div");
	$(rem.menu).addClass("list-menu").html('<span class="list-icon icon-play" title="下一首播放"></span><span class="list-icon icon-add" title="加入正在播放"></span><span class="list-icon icon-del" title="删除"></span>').delegate("click", ".list-icon", function(e) {
		let num = parseInt($(e.path[3]).child(0).text()) - 1;
		if (isNaN(num)) return false;

		switch (this[0].classList[1]) {
			case "icon-add":
				if(this.toggleClass("added").hasClass("added")) {
					addList(musicList[rem.listDisplay].item[num], 1);
					msg('已加入');
				} else {
					removeList(musicInList(1, musicList[rem.listDisplay].item[num]), 1);
					msg('已删除');
				}
				// listClick(num);
				break;
			case "icon-play":
				let m3 = musicList[3].item;
				if(rem.listPlaying != 3) {
					rem.listPlaying = 3;
					delete rem.prefetch.cacheId;
					rem.idPlaying = -1;
					m3.length = 0;
				}

				while(rem.idPlaying >= 0) { // 重置指针到数组顶端
					m3.shift();
					rem.idPlaying--;
				}

				let msc = musicList[rem.listDisplay].item[num];
				let i = musicInList(3, msc);
				if(i != -1) {
					msg('已存在! 还有 ' + (i - rem.idPlaying) + " 首");
					return;
				}

				if(m3.length >= config.nextListMax) {
					msg('队列已满(' +  config.nextListMax + ')!');
					return;
				}
				msg("排队中，还有 " + (musicList[3].item.push(msc) - 1 - rem.idPlaying) + " 首");
				break;
			case "icon-del":
				removeList(num, rem.listDisplay);
				break;
			case "icon-pause":
				pause();
			break;
		}
		return true;
	});

	function listMenuHandler(e) {
		if((e != null) == rem.menu.isConnected) return;

		let num = parseInt(this.child(0).text()) - 1;
		if (isNaN(num)) return false;

		let c = rem.menu.children, ls = rem.listDisplay;
		$(c[0])[ls != 3 && rem.currentPlaying ? 'show' : 'hide']();
		$(c[1])[ls != 1 ? 'show' : 'hide']().removeClass("added").attr("title", "加入正在播放")['if'](musicInList(1, musicList[rem.listDisplay].item[num]) != -1).addClass("added").attr("title", "从正在播放删除");
		$(c[2])[(ls >= 1 && ls <= 3 || musicList[ls].my) ? 'show' : 'hide']();

		this.find(".name").append(rem.menu);
	}

	// 列表项播放
	$("#play-list").delegateChild(rem.isMobile ? "click" : "dblclick", ".list", function(e) {
		if(e.target.classList.contains("mobile-menu")) return false;
		document.getSelection().empty();
		let num = parseInt(this.child(0).text()) - 1;
		if (isNaN(num)) return false;
		listClick(num);
	})

	// 右侧小点查看详细信息
	.delegateChild("click", ".mobile-menu", function(e) {
		let num = parseInt(this.findSelf(":prev").text()) - 1;
		if (isNaN(num)) return false;

		musicInfo(musicList[rem.listDisplay], num);
		return false;
	})

	// 列表鼠标移过显示对应的操作按钮
	.delegateChild("mousemove", ".list!.head!.clickable", listMenuHandler)

	// 点击加载更多
	.delegate("click", ".list.clickable", function() {
		if(this.hasClass("list-loadmore")) {
			if(rem.listDisplay == 0) {
				this.removeClass('list-loadmore').html('加载中...');
				ajaxSearch();
			}
		} else {
			$.confirm("清空"+musicList[rem.listDisplay].name+"？",() => {
				unRandom(rem.listDisplay);
				// 清空当前显示的列表
				musicList[rem.listDisplay].item.length = 0;
				// 清空内容
				if (rem.listDisplay == 1) {
					dataStore('playing', '');
					$("#sheet .sheet(0) img").attr('src', 'images/player_cover.png');
				} else if (rem.listDisplay == 2) {
					dataStore('history', '');
				} else {
					dataStore('custom_list', rem.customList);
				}
				loadList(rem.listDisplay);
				msg('已清空');
			});
		}
	})

	// 鼠标移出删除菜单
	.on("mouseout", function(e) {
		if (rem.menu.isConnected && !rem.menu.parentElement.parentElement.isSameSource(e.toElement)) {
			rem.menu.remove();
		}
	})

	.delegateChild("contextmenu", ".list!.head!.clickable", function(e) {
		if (e.ctrlKey) return;
		F_DOM.stopEvent(e);
		let menu = $("#song_menu").show();
		let max = window.innerHeight - menu[0].offsetHeight;
		menu.css({
			top: Math.min(e.pageY, max) + "px", 
			left: e.pageX + "px"
		});
		rem.menuClick = parseInt(this.find(".num").text()) - 1;
	})

	// 触屏就没必要了
	.if(!rem.isMobile)

	// 记好了，以后绝对会用到！
	// 计算X=[定高元素列表]中鼠标相对X的偏移
	.on("mousemove", function(e) {
		let y = e.offsetY;
		let t = e.delegatedTarget;
		if (!t) {
			rem.menuMouseOffset = y;
			return;
		}
		e = t.parentElement;
		let ch = e.children;

		let i = e.scrollTop - ch[0].offsetHeight;
		// 不完全包含的列表项还有多少px滚开
		let partialOff = i % ch[1].offsetHeight;
		i = parseInt(i / ch[1].offsetHeight) + 1;

		let j = $(t).find(".num").text() - i;
		rem.menuMouseOffset = j * ch[1].offsetHeight - partialOff + y;
	})

	//...... 以此判断鼠标位置的被动移动
	.on("scroll", function(e) {
		if (!rem.menu.isConnected) return;

		e = e.target;
		let ch = e.children;
		let i = Math.ceil((rem.menuMouseOffset + e.scrollTop - ch[0].offsetHeight) / ch[1].offsetHeight);

		listMenuHandler.apply($(ch[i]));
	}, 0, {passive: true});

	$(window).on("mousedown", function(e) {
		$(".my_submenu").hide();
		if(e.button != 0) return;
		if(rem.menuEditing && 
			e.target != rem.menuEditing[0]) {
				rem.menuEditing.on("change");
		}
	});

	// 专辑右键菜单
	$("#album_menu").delegateChild("mousedown", "li", function(e, index) {
		switch(index()) {
			case 0:
				$.prompt("名字?", function(val) {
					listCopy(rem.menuClick, val);
				}, musicList[rem.menuClick].name);
				break;
			case 1:
				e = $("#sheet .sheet$data-no=" + rem.menuClick);
				let val = e.find("p").text();
				setTimeout(function() {
					e.find("p").empty().append(
						rem.menuEditing = $("<input type='text' value='" + val + "' required/>")
						.on("change", function(e) {
							listRename(rem.menuClick, e.target.value);
							delete rem.menuEditing;
						})
					);
				}, 0);
				break;
			case 2:
				listRemove(rem.menuClick);
				break;
		}
	});

	// 点击专辑显示专辑歌曲
	$("#sheet").delegateChild("click", ".remove", function(e) {
		if(!rem.customList) return;
		e = $(e.delegatedTarget).parent();
		let i = e.data("no");
		let begin = rem.customList.begin;
		let end = begin + rem.customList.length;
		if(i >= begin && i < end) {
			$.confirm("确定删除 " + e.child(1).text() + " ?", function() {
				musicList.splice(i, 1);
				rem.customList.list.splice(i - begin, 1);
				if (!--rem.customList.length) {
					delete rem.customList;
				}
				dataStore("custom_list", rem.customList);

				loadSheets();

				if(rem.listPlaying >= i)
					if(rem.listPlaying == i)
						rem.listPlaying = null;
					else
						rem.listPlaying--;
			}, EMPTY_FN);
		}
	})

	.delegateChild("click", ".sheet img", function(e) {
		let num = parseInt(this.data("no"));
		// 是用户列表，但是还没有加载数据
		if (musicList[num].item.length === 0 && musicList[num].creatorID) {
			ajaxPlayList(musicList[num], loadList);
			return true;
		}
		loadList(num, 1);
	})

	.delegateChild("contextmenu", ".sheet img", function(e) {
		if (e.ctrlKey) return;
		F_DOM.stopEvent(e);
		e = $("#album_menu").show().css({
			top: e.pageY + "px", 
			left: e.pageX + "px"
		}).children();
		let num = parseInt(this.data("no"));
		let my = musicList[num].my;
		e[1].style.display = !my ? "none" : "block";
		e[2].style.display = !my ? "none" : "block";
		rem.menuClick = num;
	})

	// 刷新用户列表
	.delegate("click", "span", function() {
		switch(this[0].classList[0]) {
			case "login-in":
				$.dialog.prompt('请输入您的网易云 UID', function(val) { // 输入后的回调函数
					if (isNaN(val) || !val.length) {
						msg('uid 只能是数字').shake();
						return false;
					}
					ajaxUserList(val);
				}, "", {
					button: [{
						value: '帮助', 
						callback: function(index, layero) {
							$.dialog({
								title: '如何获取您的网易云UID？',
								content: '1、首先<a href="http://music.163.com/" target="_blank">点我(http://music.163.com/)</a>打开网易云音乐官网<br>' +
									'2、然后点击页面右上角的“登录”，登录您的账号<br>' +
									'3、点击您的头像，进入个人中心<br>' +
									'4、此时<span style="color:red">浏览器地址栏</span> <span style="color: green">/user/home?id=</span> 后面的<span style="color:red">数字</span>就是您的网易云 UID', 
									skin: "d-dark"
							});
						}
					}],
				});
			break;
			case "login-refresh":
				dataStore('neteaseList');
				msg('刷新歌单');
				clearNeteaseList();
			break;
			case "login-out":
				dataStore('netease');
				dataStore('neteaseList');
				msg('已退出');
				clearNeteaseList(true);
			break;
		}
	});

	$(".float-btn(0)").on("click", function() {
		if (rem.currentPlaying == undefined) {
			msg('请先播放歌曲').shake();
			return false;
		}

		musicInfo(musicList[rem.listPlaying], rem.idPlaying);
	});

	$(".float-btn(1)").on("click", function() {
		if (rem.currentPlaying == undefined) {
			msg('请先播放歌曲').shake();
			return false;
		}

		$.dialog({
			id: "MSpd",
			content: '<input type="text" id="mspeed" placeholder="0.1 - 8">', 
			title: "速度选择",
			okValue: '应用', 
			ok: function() {
				let spd = parseFloat($("#mspeed").val());
				if (spd != spd || spd > 8 || spd < 0.1) {
					msg("输入无效").shake();
					return false;
				}

				rem.audio[0].playbackRate = spd;
			}
		});
	});

	$(".header .btn").on("click", function() {
		let user = dataRead("selfUser");
		if (user) {
			$(".header .btn").text("请登录");
			dataStore("selfUser", null);
			ajaxMPUserList("null");
		} else {
			userLogin();
		}
	});

	$(".logo").on("click", function() {
		let h = $(".hidden");
		if (h.length) {
			h.show().removeClass("hidden");
			return;
		}
		msg((cache = !cache) ? "已开启自动缓存(请注意硬盘空间!)" : "已关闭自动缓存");
		dataStore("cache", cache ? 1 : null);
	}).on("contextmenu", function(e) {
		F_DOM.stopEvent(e);
		msg("进入迫真·省电模式, 单击Logo退出");
		$(".blur-bg", ".center", "#music-progress .dot", "#music-progress .bar.prog").addClass("hidden").hide();
	});

	$(".lyric").on("contextmenu", function(e) {
		if (e.target.nodeName == "DIV") return;

		F_DOM.stopEvent(e);
		$('.container').toggleClass("lyric-mode");
		// 触屏选中问题
		setTimeout(function() { document.getSelection().empty(); }, 1);

		stopLyric&&stopLyric();
		setTimeout(function(r) {
			lastLyric = -1;
			scrollLyric(r);
		}, 701, lastLyric);
	});

	// 播放、暂停按钮的处理
	$(".btn-play").on("click", pause);

	// 2019 循环顺序的处理
	$(".btn-order").on("click", cylOrder);

	// 上一首
	$(".btn-prev").on("click", function() {
		nextMusic(-1);
	});

	// 下一首
	$(".btn-next").on("click", function() {
		nextMusic(1);
	});

	// 图片加载失败处理
	$('img!.pic-preload').on("error", function(e) {
		e.target.src = 'images/player_cover.png';
	});

	// 初始化播放列表
	initList();

	$("#global-loading").remove();

	if(rem.plugins) {
		for(let m of Object.values(rem.plugins)) loadPlugin(m);
		mkPlayer.plugin = (n, m) => loadPlugin(m);
		console.info("Active plugin", Object.keys(rem.plugins));
		delete rem.plugins;
	}
});