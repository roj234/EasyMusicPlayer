mkPlayer.plugin("WebAudio-DSP", function() {
	class SoundVisualizer {
		constructor(c) {
			this.el = c;

			this.canvas = $("<canvas>").attr({
				width:c.width()+"px",
				height:c.height()+"px"
			}).appendTo(this.el);

			var ctx = this.paper = this.canvas[0].getContext("2d");
			ctx.fill = "transparent";
			ctx.lineCap = "round";
			ctx.lineJoin = "round";
			ctx.lineWidth = 1;
			ctx.strokeStyle = "rgb(7,108,240)";
		}

		visualize(node) {
			node.connect(this.node);
		}

		destroy() {
			this.node?.disconnect();
		}

		requestDraw(pcm) {
			this.pcm = pcm;
			if (this.pending) return;
			this.pending = true;
			requestAnimationFrame(() => {
				delete this.pending;
				this.draw(this.pcm);
			});
		}

		draw(pcm) {}
	}

	class WaveVisualizer extends SoundVisualizer {
		constructor(ctx, c, userms) {
			super(c);

			if (!userms) {
				var that = this;
				this.node = ctx.createScriptProcessor(1024, 1, 1);
				this.node.onaudioprocess = function(e) {
					that.requestDraw(e.inputBuffer.getChannelData(0));
				};
				this.node.connect(ctx.destination);
				this.maxSamples = 50;
			} else {
				window.__rmsvis = this;
				window.__rmsvistext = $("<span>").appendTo(c);
				this.maxSamples = this.canvas.width();
			}

		}

		draw(pcm) {
			var p = this.paper;

			var width = this.canvas.width();
			var height = this.canvas.height();

			var yCenter = height / 2;

			if (this.samples == null || this.samples++ >= this.maxSamples) {
				this.samples = 0;
				this.x = -1;
				this.y = height / 2;
			}

			var x = this.x, y = this.y;
			var width1 = Math.ceil(width/this.maxSamples);

			p.beginPath();
			p.moveTo(x++, y);
			p.clearRect(x,0,width1,height);

			var dt = Math.floor(pcm.length / width1);
			if (dt == 0) dt = 1;
			// sample pcm and build path string
			for (let i = 0; i < pcm.length - 1; i += dt) {
				y = yCenter - Math.round(pcm[i] * height);
				p.lineTo(x, y);
				x++;
			}

			p.stroke();
			p.closePath();

			p.fillRect(x,0,1,height);

			this.x = x-1, this.y = y;
		}
	}

	const BAR_SPACE = 1;

	class FreqVisualizer extends SoundVisualizer {
		constructor(ctx, c) {
			super(c);

			this.node = ctx.createAnalyser();
			this.node.minDecibels = -90;
			this.node.maxDecibels = -0;
			this.data = new Float32Array(this.node.frequencyBinCount);
			this.freqBars = c.width() / BAR_SPACE;

			this.timer = setInterval(() => this.requestDraw(), 30);
		}

		destroy() {
			super.destroy();
			clearInterval(this.timer);
			this.data = null;
		}

		draw() {
			var p = this.paper;

			var width = this.canvas.width();
			var height = this.canvas.height();

			var data = this.data, node = this.node;
			if (!data) return; // destroy
			if (data.length !== node.frequencyBinCount) {
				data = this.data = new Float32Array(node.frequencyBinCount);
			}
			node.getFloatFrequencyData(data);

			// clamp to 0..1
			let min = node.minDecibels;
			let dt = node.maxDecibels - min;
			for (let i=0;i<data.length;i++)
				data[i] = (data[i] - min) / dt;

			p.clearRect(0,0,width,height);

			var numBars = this.freqBars;
			var multiplier = node.frequencyBinCount / numBars;
			for (var i = 0; i < numBars; ++i) {
				var magnitude = 0;
				var offset = Math.floor( i * multiplier );
				// gotta sum/average the block, or we miss narrow-bandwidth spikes
				for (var j = 0; j < multiplier; j++) {
					magnitude += data[offset + j];
				}
				magnitude = magnitude / multiplier * height;

				p.fillStyle = "hsl( " + Math.round((i*330)/numBars) + ", 100%, 50%)";
				p.fillRect(i * BAR_SPACE, height, BAR_SPACE, -magnitude);
			}
		}
	}

	$('<div class="btn">KaraDSP</div>').appendTo($(".header"))
	.on("click", function(e) {
		e.target.remove();

		var ac = new AudioContext();
		var src = ac.createMediaElementSource(rem.audio[0]);

		window.ac = ac;

		var mixer0 = ac.createGain();
		var mixer1 = ac.createGain();
		var mixer2 = ac.createGain();
		var mixer3 = ac.createGain();
		var mixer4 = ac.createGain();
		mixer4.connect(ac.destination);

		var div = $("<div>").css({width:"400px", height:"200px"});
		div.append('<span style="position: absolute; right: 4px; bottom: 4px; font-size: 12px;">Demo by Roj234</span>拖动滑块调节效果');

		var cfg_ko = karaokeFilter(ac, src, mixer0);
		cfg_ko.frequency(140, 7400);
		window.cfg_ko = cfg_ko;
		var cfg_ec = echoFilter(ac, mixer0, mixer1);
		var cfg_disto = distortionFilter(ac, mixer1, mixer2);
		var cfg_conv = convolveFilter(ac, mixer2, mixer3);
		var cfg_rms = RMSFilter(ac, mixer3, mixer4);

		function slider(name, cb, max=1, init=0) {
			div.append("<br />" + name + ":&nbsp;");
			max *= 1000; init *= 1000;
			$("<input type=range min=0 max="+max+" value="+init+" />").appendTo(div)
			.on("change", function(e) {
				var x = parseInt(e.target.value);
				if (x<0||x>max) return;
				x/=1000;
				cb(x);
				e.target.title = x;
			});
		}

		function mixerSlider(mixer) {
			slider("输出音量", (v) => mixer.gain.value = v, 5, 1);
		}

		slider("消音比例", cfg_ko.strength);
		mixerSlider(mixer0);
		slider("回声强度", cfg_ec.strength, 1.5);
		slider("回声时间", cfg_ec.time, 0.5);
		slider("失真强度", (e) => cfg_disto.amount(Math.exp(e)), 9);
		slider("混响强度", cfg_conv.strength);
		mixerSlider(mixer3);
		slider("归一音量", cfg_rms.target_rms);

		$.dialog({title:"Visualizer", content:div[0], beforeunload: function() {
			//fs.destroy();
			fs1.destroy();
			//vs.destroy();
			vs1.destroy();
			//fs.canvas.remove();
			fs1.canvas.remove();
			//vs.canvas.remove();
			vs1.canvas.remove();
			return false;
		}});

		//var fs = new FreqVisualizer(ac, div);
		//fs.visualize(src);

		var fs1 = new FreqVisualizer(ac, div);
		fs1.visualize(mixer4);

		//var vs = new WaveVisualizer(ac, div);
		//vs.visualize(mixer4);

		var vs1 = new WaveVisualizer(ac, div, true);
	});

	class SlidingAverage {
		constructor(window) {
			this.win = window;
			this.len = 0;
			this.avg = 0;
		}
		sum(val) {
			if (this.len >= this.win) this.len = this.win-1;
			let avg = this.avg * this.len + val;
			return this.avg = avg / ++this.len;
		}
	}

	function RMSFilter(ctx, src, dst, canvas) {
		const gainNode = ctx.createGain();
		const nullNode = ctx.createGain();
		const vol = ctx.createScriptProcessor(256, 1, 1);

		var targetRms = 0.05;

		let avgRms = new SlidingAverage(1024);
		let avgMax = new SlidingAverage(128);

		let maxRms = 0.2;
		let updateCount = 0;
		vol.onaudioprocess = function(evt) {
			if (targetRms == 0) {
				gainNode.gain.value = 1;
				return;
			}

			const input = evt.inputBuffer.getChannelData(0),
				len = input.length;

			let sum = 0;
			for (let i = 0; i < len; i++) {
				sum += input[i] * input[i];
			}
			let rms = Math.sqrt(sum / len);
			//let rms = Math.hypot.apply(Math, input);
			//rms **= 2;
			if (window.__rmsvis) {
				if (rms > maxRms) maxRms = rms;
				window.__rmsvis.requestDraw([compress(rms, maxRms)-0.5, 0]);
				if (++ updateCount == 200) {
					window.__rmsvistext.text("滑动有效值("+avgMax.avg.toFixed(3)+"): " + avgRms.avg.toFixed(5) + " | 对数增益: " + compress(targetRms, avgRms.avg).toFixed(4));
					updateCount = 0;
					avgMax.sum(0.2);
					maxRms = avgMax.sum(maxRms);
				}
			}
			if (rms < 1e-2) return;

			rms = avgRms.sum(rms);

			const gain = compress(targetRms, rms);
			gainNode.gain.value = 
				gain != gain 
				? 1 : 
				gain > 20 
				? 20 : 
				gain < 0.05 
				? 0.05 
				: gain;
		};

		src.connect(gainNode);
		gainNode.connect(dst);

		src.connect(vol);
		vol.connect(nullNode);
		nullNode.connect(dst);
		nullNode.gain.value = 1e-100;

	return {
			target_rms: function(volume) {
				targetRms = volume*volume;
			}
		};
	}

	function compress(num, max) {
		return Math.log10(num+1) / Math.log10(max+1);
	}

	function karaokeFilter(ctx, src, dst) {
		// direct output
		let direct = ctx.createGain();
		// create the percent
		let devocal = ctx.createGain();
		direct.gain.value = 1;
		devocal.gain.value = 0;

		src.connect(direct);
		direct.connect(dst);

		src.connect(devocal);

		// 160-7940 Hz
		let filterLP = ctx.createBiquadFilter();
		filterLP.type = 'bandpass';

		let filterHP = ctx.createBiquadFilter();
		filterHP.type = 'notch';

		devocal.connect(filterLP);
		devocal.connect(filterHP);

		// create the processor (buffer input output)
		processor = ctx.createScriptProcessor(2048, 2, 1);
		processor.onaudioprocess = karaoke;

		filterHP.connect(processor);
		filterLP.connect(dst);
		processor.connect(dst);

		// based on https://gist.github.com/kevincennis/3928503
		// flip phase of right channel
		// http://www.soundonsound.com/sos/sep04/articles/qa0904-7.htm
		function karaoke(evt) {
			var inputL = evt.inputBuffer.getChannelData(0),
				inputR = evt.inputBuffer.getChannelData(1),
				output = evt.outputBuffer.getChannelData(0),
				len = inputL.length,
				i = 0;
			for (; i < len; i++) {
				output[i] = inputL[i] - inputR[i];
			}
		}

		return {
			strength: function(val) {
				if (arguments.length === 0) return devocal.gain.value;
				direct.gain.value = 1-val;
				devocal.gain.value = val;
			}, 
			frequency: function(from, to) {
				if (arguments.length === 0)
					return [filterLP.frequency.value-filterLP.Q.value,
									filterLP.frequency.value+filterLP.Q.value];
				var center = (from+to)/2;
				var delta  = (to-from)/2;
				filterLP.frequency.value = 
				filterHP.frequency.value = center;
				filterLP.frequency.Q = 
				filterHP.frequency.Q = delta;
			}, 
			destroy: function() {
				direct.disconnect();
				devocal.disconnect();
				filterLP.disconnect();
				processor.disconnect();

				src.connect(dst);
			}
		};
	}

	function echoFilter(ctx, src, dst) {
		src.connect(dst);

		let echo = ctx.createGain();
		echo.gain.value = 0;

		src.connect(echo);

		let filter = ctx.createBiquadFilter();
		filter.frequency.value = 1100;
		filter.type = "highpass";

		let delay = ctx.createDelay(0.5);

		echo.connect(filter);
		filter.connect(delay);
		delay.connect(dst);

		return {
			strength: function(val) {
				if (arguments.length === 0) return echo.gain.value;
				echo.gain.value = val;
			}, 
			time: function(val) {
				if (arguments.length === 0) return delay.delayTime.value;
				delay.delayTime.value = val;
			}, 
			destroy: function() {
				echo.disconnect();
				delay.disconnect();
			}
		};
	}

	function distortionFilter(ctx, src, dst) {
		let distortion = ctx.createWaveShaper();
		src.connect(distortion);
		distortion.connect(dst);

		let _amount = 0;
		// Distortion curve for the waveshaper, thanks to Kevin Ennis
		// http://stackoverflow.com/questions/22312841/waveshaper-node-in-webaudio-how-to-emulate-distortion
		function setDistortionCurve(amount) {
			if (amount === 0) {
				distortion.curve = null;
				return;
			}

			let k = typeof amount === "number" ? amount : 50,
				n_samples = 44100,
				curve = new Float32Array(n_samples),
				deg = Math.PI / 180,
				i = 0,
				x;
			for (; i < n_samples; ++i) {
				x = (i * 2) / n_samples - 1;
				curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
			}
			distortion.curve = curve;
		}

		return {
			amount: function(val) {
				if (arguments.length === 0) return _amount;
				setDistortionCurve(val);
				_amount = val;
			}, 
			destroy: function() {
				distortion.disconnect();
				src.connect(dst);
			}
		};
	}

	function convolveFilter(ctx, src, dst) {
		// direct output
		let direct = ctx.createGain();
		let conv = ctx.createGain();
		direct.gain.value = 1;
		conv.gain.value = 0;

		src.connect(direct);
		direct.connect(dst);

		let convolver = ctx.createConvolver();
		src.connect(conv);
		conv.connect(convolver);
		convolver.connect(dst);

		$.ajax({
			url:"irHall.ogg",
			responseType:"arraybuffer",
			success: function(data) {
				ctx.decodeAudioData(data,
					(buffer) => convolver.buffer = buffer,
					(e) => console.log("Error decoding audio", e.err)
				);
			}
		});

		return {
			strength: function(val) {
				if (arguments.length === 0) return conv.gain.value;
				direct.gain.value = 1-val;
				conv.gain.value = val;
			}, 
			destroy: function() {
				direct.disconnect();
				conv.disconnect();
				convolver.disconnect();

				src.connect(dst);
			}
		};
	}
});