mkPlayer.plugin("lyricAutoBG", function() {
	var currMusic;
	function onPlay(event, music) {
		currMusic = music;
		$(".lyric").css("color", music.color||"");
	}

var img = $("#music-cover").on("load", function(e) {
	if (currMusic&&currMusic.color === "") return;

	var color = "";

	var list = getLightDark(e.target);
	if (list) {
		color = rgb2hex(list.light);
		$(".lyric").css("color", color);
	}

	if (currMusic) currMusic.color = color;
});

	function BSLowHeap(cmp, max) {
		this.entries = Array();
		this.cmp = cmp;
		this.max = max;
	}
	BSLowHeap.prototype.binarySearch = function(key) {
		var low = 0;
		var high = this.entries.length - 1;

		var a = this.entries;

		while (low <= high) {
			var mid = (low + high) >>> 1;
			var midVal = this.cmp(a[mid][0], key);

			if (midVal < 0) {
				low = mid + 1;
			} else if (midVal > 0) {
				high = mid - 1;
			} else
				return mid; // key found
		}

		// low ...

		return -(low + 1);  // key not found.
	};


	BSLowHeap.prototype.add = function(node) {
		if (this.entries.length === this.max) {
			this.entries.length = this.max-1;
		}

		var nearest = this.binarySearch(node);
		if(nearest >= 0) {
			this.entries[nearest][1]++;
			return false;
		} else {
			var index = -nearest - 1;
			var data1 = this.entries;
			data1.splice(index, 0, [node,1]);
			return true;
		}
	}

function getLightDark(img) {
	var c = new OffscreenCanvas(img.naturalWidth,img.naturalHeight);
	var ctx = c.getContext("2d");

	ctx.drawImage(img,0,0);
	try {
		var data = ctx.getImageData(0,0,c.width,c.height).data;
	} catch (e) {return;}

	var qty = 512;
	var dit = new BSLowHeap((a, b) => {
		return a.l-b.l;
	}, qty);
	var lit = new BSLowHeap((a, b) => {
		return b.l-a.l;
	}, qty);

	var L = 0;
	for (let j = 0; j < data.length; j += 4) {
		var hsl = rgb2hsl(data[j],data[j+1],data[j+2]);

		if (hsl.s > 999) hsl.s = 999;
		if (hsl.l > 128) L++;

		lit.add(hsl);
		dit.add(hsl);
	}

	lit = normalize(lit.entries,L > data.length / 10);
	dit = normalize(dit.entries);

	return {list:[lit, dit], light: avg(lit), dark: avg(dit), picLight: L > data.length / 7};
}

function rgb2hex(rgb) {
	function x(x) {
		return parseInt(x*255).toString(16).padStart(2,'0');
	}
	return "#" + x(rgb.r) + x(rgb.g) + x(rgb.b);
}

function normalize(a,l) {
	// '二值化'
	a.length = Math.max(1, parseInt(a.length / 2));
	a.sort((b,a)=>a[1]-b[1]);

	a.length = Math.min(a.length, Math.max(50, parseInt(a.length / 10)));

	// 按相似颜色分组
	var c = Array(36);
	for(var i=0;i<a.length;i++) {
		var x = Math.round(a[i][0].h * 36);
		c[x]?c[x].push(a[i]):c[x]=[a[i]];
	}

	c.sort((b,a)=>cnt(a)-cnt(b));
	return c[c[1]&&l?1:0];
}

function cnt(a) {
	var cnt = 0;
	for(var i = 0; i < a.length; i++) {
		cnt += a[i][1];
	}
	return cnt;
}

function avg(a) {
	var  rgb = {r:0, g:0, b:0}, cnt = 0;
	for(var i = 0; i < a.length; i++) {
		var v = a[i];
		var v1 = hsl2rgb(v[0].h,v[0].s,v[0].l+10);
		rgb.r += sRGBToLinear(v1.r/255)*v[1];
		rgb.g += sRGBToLinear(v1.g/255)*v[1];
		rgb.b += sRGBToLinear(v1.b/255)*v[1];
		cnt += v[1];
	}
	rgb.r = Math.min(1, linearTosRGB(rgb.r/cnt));
	rgb.g = Math.min(1, linearTosRGB(rgb.g/cnt));
	rgb.b = Math.min(1, linearTosRGB(rgb.b/cnt));
	return rgb;
}

function sRGBToLinear(color) {
	if (color <= 0.04045) {
		return color / 12.92;
	} else {
		return Math.pow(((color + 0.055) / 1.055), 2.4);
	}
}

function linearTosRGB(color) {
	if (color <= 0.04045/12.92) {
		return color * 12.92;
	} else {
		return 1.055 * Math.pow(color, 1/2.4) - 0.055;
	}
}

function hsl2rgb(h,s,l,rgb) {
	rgb = rgb || { r: 0, g: 0, b: 0 };

	if (s === 0) {
		rgb.r = rgb.g = rgb.b = l;
	} else {
		function hue2rgb(p, q, t) {
			if (t < 0) t += 1;
			if (t > 1) t -= 1;
			if (t < 1 / 6) return p + ( q - p ) * 6 * t;
			if (t < 1 / 2) return q;
			if (t < 2 / 3) return p + ( q - p ) * 6 * ( 2 / 3 - t );
			return p;
		}

		var p = l <= 0.5 ? l * ( 1 + s ) : l + s - ( l * s );
		var q = ( 2 * l ) - p;

		rgb.r = hue2rgb(q, p, h + 1 / 3);
		rgb.g = hue2rgb(q, p, h);
		rgb.b = hue2rgb(q, p, h - 1 / 3);
	}

	return rgb;
}

function rgb2hsl(r,g,b,hsl) {
	hsl = hsl || { h: 0, s: 0, l: 0 };

	var max = Math.max(r, g, b);
	var min = Math.min(r, g, b);

	var hue, sat, lit = ( min + max ) / 2;
	if (min === max) {
		hue = sat = 0;
	} else {
		var delta = max - min;

		sat = lit <= 0.5 ? delta / ( max + min ) : delta / ( 2 - max - min );

		switch (max) {
			case r: hue = ( g - b ) / delta + ( g < b ? 6 : 0 ); break;
			case g: hue = ( b - r ) / delta + 2; break;
			case b: hue = ( r - g ) / delta + 4; break;
		}

		hue /= 6;
	}

	hsl.h = hue;
	hsl.s = sat;
	hsl.l = lit;

	return hsl;
}

	return { play: onPlay };

});