<?php
/**************************************************
 * Player 后台音乐数据抓取模块
 * 编写：mengkun, Roj234
 *************************************************/

define('HTTPS', false); // 如果您的网站启用了https，请将此项置为“true”，如果你的网站未启用 https，建议将此项设置为“false”
define('DEBUG', true); // 是否开启调试模式，正常使用时请将此项置为“false”
define('ENABLE_PHYSIC_DELETE', true);

ini_set("error_display", true);
error_reporting(DEBUG ? E_ALL : 0);

if (getParam("p")) {
	file_proxy(hash_decode(getParam("p")).getParam("e"));
	exit;
}

require_once('Meting.php');

use Metowolf\Meting;

$source = getParam('source', 'netease'); // 歌曲源

$API = (new Meting($source))->format(true); // 启用格式化功能

switch (getParam('types')) {
	case "userSong":
		if (!is_dir("user")) mkdir("user");
		$user = getParam('user');
		if (!$user) exit;

		$type = getParam('type');
		if ($type == "get") {
			if (is_file("user/$user.json")) {
				show_json(file_get_contents("user/$user.json"));
			} else {
				show_json('{"history":[], "playing":[], "custom_list":[]}');
			}
		} else {
			$data = is_file("user/$user.json") ? json_decode(file_get_contents("user/$user.json"), true) : ["history" => [], "playing" => [], "custom_list" => []];

			$v = getParam("history");
			if($v) {
				$data["history"] = json_decode($v, false, 4);
			}
			$v = getParam("playing");
			if($v) {
				$data["playing"] = json_decode($v, false, 4);
			}
			$v = getParam("custom_list");
			if($v) {
				$data["custom_list"] = json_decode($v, false, 7);
			}

			file_put_contents("user/$user.json", json_encode($data, JSON_UNESCAPED_UNICODE));
			show_json('{"ok": 1}');
		}

		break;
	case 'url': // 获取歌曲链接
		$id = getParam('id'); // 歌曲ID

		if($source == "file") break;

		$bitrate = 320;
		$f = false;
		$arr = getParam("cache");
		if (strlen($arr) > 0) {
			$f = "music/" . path_filter($arr . ".mp3");
		}

		if ($f === false || !is_file($f)) {
			$data = $API->url($id, $bitrate);
			$tmp  = json_decode($data, true);
			if (getParam("c") && $tmp['br'] > 0 && $f !== false) {
				curlget($tmp['url'], $f);
				if (filesize($f) < $tmp['size']) {
					$cont = str_replace("m7c", "m7", $tmp['url']);
					$cont = str_replace("m8c", "m8", $cont);
					curlget($tmp['url'], $f);
					if (filesize($f) < $tmp['size']) {
						$cont = str_replace("m7", "m7c", $tmp['url']);
						$cont = str_replace("m8", "m8c", $cont);
						curlget($tmp['url'], $f);
					}
				}
			} else {
				show_json($data);
			}
		}

		show_json([
				'url' => escape("music/$arr.mp3"),
				'br' => $bitrate,
				'size' => filesize($f)
			]);
		break;

	case 'pic':
		$id = getParam('id');
		if($source == "file") break;

		$f= false;
		$arr = getParam("cache");
		if (strlen($arr) > 0) {
		  $f   = "music/" . path_filter($arr . ".jpg");
		}

		if ($f === false || !is_file($f)) {
			$data = $API->pic($id);
			$tmp  = json_decode($data, true);
			if (getParam("c") && strlen($tmp['url']) > 0 && $f !== false) {
				curlget($tmp['url'], $f);
			}
		} else {
			$data = json_encode(Array(
				'url' => escape("music/$arr.jpg")
			), 256);
		}

		show_json($data);

	case 'lyric': // 获取歌词
		$id = getParam('id'); // 歌曲ID

		if($source == "file") {
			$f = substr(hash_decode($id),0,-1);
			if (!is_file($f.".lrc")) show_json("{}");
		} else {
			$f = false;
			$c = getParam("cache");
			if (strlen($c) > 0) {
				$f = "music/" . path_filter($c);
			}
		}

		if ($f === false || !is_file($f . ".lrc")) {
			$data = $API->lyric($id);
			if (getParam("c") && $f !== false) {
				$tmp = json_decode($data, true);
				if ($tmp['lyric'] != "")
					file_put_contents($f . ".lrc", $tmp['lyric']);
				if ($tmp['tlyric'] != "")
					file_put_contents($f . ".cn.lrc", $tmp['tlyric']);
			}
		} else {
			$arr = [
				'lyric' => file_get_contents($f.".lrc")
			];
			if (is_file($f . ".cn.lrc")) {
				$arr['tlyric'] = file_get_contents($f.".cn.lrc");
			}
			$data = json_encode($arr, 256);
		}

		show_json($data);

	case 'phy_del':
		$pf = hash_decode(getParam("id"));
		if (!ENABLE_PHYSIC_DELETE) show_json("security not pass");
		del($pf."jpg");
		del($pf."ogg");
		del($pf."webm");
		del($pf."m4a");
		del($pf."mp3");
		del($pf."lrc");
		del($pf."cn.lrc");
		show_json("done");

	case 'userlist': // 获取用户歌单列表
		$uid = getParam('uid'); // 用户ID

		$url  = 'http://music.163.com/api/user/playlist/?offset=0&limit=201&uid=' . $uid;
		$data = file_get_contents($url);

		show_json($data);

	case 'playlist': // 获取歌单中的歌曲
		$id = getParam('id'); // 歌单ID

		// 歌单每小时更新一次
		$json = "songlist/" . path_filter($id) . $source . ".json";
		if(is_file($json) && time() < filemtime($json) + 3600) {
			show_json(file_get_contents($json));
		}

		if($source == "file") {
			$item = [];
			$data = [
				"name" => $id, 
				"image" => "images/folder.png", 
				"creator" => [
					"name" => "", 
					"head" => ""
				], 
				"items" => &$item
			];
			if(is_dir($id)) {
				$files = [];

				$c = $id[strlen($id) - 1];
				list_file($c == '\\' || $c == "/" ? substr($id, 0, -1) : $id, $files);

				foreach($files as $path => $file) {
					$pos = strrpos($file,'.');
					if (false == $pos) continue;
					$ext = strtolower(substr($file, ++$pos));

					if($ext == "mp3" || $ext == "m4a" || $ext == "ogg" || $ext == "webm") {
						$x = -strlen($ext);
						$total = explode(" - ", substr($file, 0, $x-1));

						$path = substr($path, 0, $x);
						$v = [
							"id" => hash_encode($path), 
							"name" => $total[0],
							"f" => 1, 
							"url" => $ext
						];

						foreach (["jpg", "jpeg", "png", "bmp"] as $ext) {
							$pic = $path.$ext;
							if (is_file($pic)) {
								$v['pic'] = $ext;
								break;
							}
						}

						$lrc = $path."lrc";
						if (is_file($lrc)) $v['f'] = 2;

						if(count($total) < 2) {
							$v["album"]  = "文件";
							$v["artist"] = "秩名"; 
						} else {
							$v["album"]  = $total[isset($total[2])?2:0];
							$v["artist"] = $total[1];
						}

						$item[]=$v;
					}
				}
			}
			$data = json_encode($data,256);
		} else {
			$data = $API->playlist($id);
		}

		if(is_dir("songlist"))
			file_put_contents($json, $data);
		show_json($data);

	case 'search': // 搜索歌曲
		$s = getParam('name');
		$arr = [
			"page" => getParam('page', 1), 
			"limit" => getParam('limit', 20)
		];

		switch(getParam("kind", 0)) {
			case 0: // 名字
			$data = $API->search($s, $arr);
			$song = json_decode($data, true);
			$song = ['items' => $song];
			break;
			case 1: // 专辑ID
			$data = $API->album($s, $arr);
			$song = json_decode($data, true);
			break;
			case 2: // 歌手ID
			$data = $API->artist($s, $arr);
			$song = json_decode($data, true);
			break;
		}

		show_json($song);
		break;

	default:
		if (!DEBUG) {
			echo '参数无效';
		} else {
			echo '<!doctype html><html><head><meta charset="utf-8"><title>信息</title><style>* {font-family: microsoft yahei}</style></head><body> <h3>EasyMusicPlayer</h3><p><font color="red">您已开启 Api 调试功能，正常使用时请在 api.php 中关闭该选项！</font></p><br>';

			echo '<p>PHP 版本：' . phpversion() . ' （本程序要求 PHP 5.4+）</p><br>';

			echo '<p>服务器函数检查</p>';
			echo '<p>curl_exec: ' . checkfunc('curl_exec', true) . ' （用于获取音乐数据）</p>';
			echo '<p>file_get_contents: ' . checkfunc('file_get_contents', true) . ' （用于获取音乐数据）</p>';
			echo '<p>json_decode: ' . checkfunc('json_decode', true) . ' （用于后台数据格式化）</p>';
			echo '<p>hex2bin: ' . checkfunc('hex2bin', true) . ' （用于数据解析）</p>';
			echo '<p>openssl_encrypt: ' . checkfunc('openssl_encrypt', true) . ' （用于数据解析）</p></body></html>';
		}
}

function curlget($url, $store) {
	$data = curl_url($url, $err);
	if ($err) {
		throw new Exception($err);
	}
	file_put_contents($store, $data);
}


function curl_url($url, &$err, $data = false, $ssl = true, $timeout = 10000, $header = array("User-Agent: Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.98 Safari/537.36"), $proxy = "0.0.0.0:0") {
    $ch = curl_init();

    curl_setopt($ch, CURLOPT_TIMEOUT_MS, $timeout);

    if($proxy != "0.0.0.0:0") {
      $tmp = explode(":", $proxy);
      curl_setopt($ch,CURLOPT_PROXY, $tmp[0]);
      curl_setopt($ch,CURLOPT_PROXYPORT, $tmp[1]);
    }
    
    curl_setopt($ch, CURLOPT_URL, $url);
    
    if(!$ssl || strtolower(substr($url, 0, 6)) !== "https://") {
        //curl_setopt($ch, CURLOPT_SSLVERSION, CURL_SSLVERSION_TLSv1);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, FALSE);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, FALSE);
    } else {
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER,TRUE);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST,2);//严格校验
    }
    //curl_setopt($ch, CURLOPT_USERAGENT, $ua);
    //curl_setopt($ch, CURLOPT_HEADER, TRUE);
    
    if(count($header) > 0)
      curl_setopt($ch, CURLOPT_HTTPHEADER, $header);
    
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, TRUE);
    
    curl_setopt($ch, CURLOPT_FAILONERROR, FALSE);
  
    curl_setopt($ch, CURLOPT_POST, $data !== false ? TRUE : FALSE);
    if($data !== false)
        curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
    
    $data = curl_exec($ch);
    
    if($data) {
      curl_close($ch);
      return $data;
    } else {
      $error = curl_errno($ch);
      curl_close($ch);
      
$error_codes = array(
1 => 'CURLE_UNSUPPORTED_PROTOCOL',
2 => 'CURLE_FAILED_INIT',
3 => 'CURLE_URL_MALFORMAT',
4 => 'CURLE_URL_MALFORMAT_USER',
5 => 'CURLE_COULDNT_RESOLVE_PROXY',
6 => 'CURLE_COULDNT_RESOLVE_HOST',
7 => 'CURLE_COULDNT_CONNECT',
8 => 'CURLE_FTP_WEIRD_SERVER_REPLY',
9 => 'CURLE_REMOTE_ACCESS_DENIED',
11 => 'CURLE_FTP_WEIRD_PASS_REPLY',
13 => 'CURLE_FTP_WEIRD_PASV_REPLY',
14 =>'CURLE_FTP_WEIRD_227_FORMAT',
15 => 'CURLE_FTP_CANT_GET_HOST',
17 => 'CURLE_FTP_COULDNT_SET_TYPE',
18 => 'CURLE_PARTIAL_FILE',
19 => 'CURLE_FTP_COULDNT_RETR_FILE',
21 => 'CURLE_QUOTE_ERROR',
22 => 'CURLE_HTTP_RETURNED_ERROR',
23 => 'CURLE_WRITE_ERROR',
25 => 'CURLE_UPLOAD_FAILED',
26 => 'CURLE_READ_ERROR',
27 => 'CURLE_OUT_OF_MEMORY',
28 => 'CURLE_OPERATION_TIMEDOUT',
30 => 'CURLE_FTP_PORT_FAILED',
31 => 'CURLE_FTP_COULDNT_USE_REST',
33 => 'CURLE_RANGE_ERROR',
34 => 'CURLE_HTTP_POST_ERROR',
35 => 'CURLE_SSL_CONNECT_ERROR',
36 => 'CURLE_BAD_DOWNLOAD_RESUME',
37 => 'CURLE_FILE_COULDNT_READ_FILE',
38 => 'CURLE_LDAP_CANNOT_BIND',
39 => 'CURLE_LDAP_SEARCH_FAILED',
41 => 'CURLE_FUNCTION_NOT_FOUND',
42 => 'CURLE_ABORTED_BY_CALLBACK',
43 => 'CURLE_BAD_FUNCTION_ARGUMENT',
45 => 'CURLE_INTERFACE_FAILED',
47 => 'CURLE_TOO_MANY_REDIRECTS',
48 => 'CURLE_UNKNOWN_TELNET_OPTION',
49 => 'CURLE_TELNET_OPTION_SYNTAX',
51 => 'CURLE_PEER_FAILED_VERIFICATION',
52 => 'CURLE_GOT_NOTHING',
53 => 'CURLE_SSL_ENGINE_NOTFOUND',
54 => 'CURLE_SSL_ENGINE_SETFAILED',
55 => 'CURLE_SEND_ERROR',
56 => 'CURLE_RECV_ERROR',
58 => 'CURLE_SSL_CERTPROBLEM',
59 => 'CURLE_SSL_CIPHER',
60 => 'CURLE_SSL_CACERT',
61 => 'CURLE_BAD_CONTENT_ENCODING',
62 => 'CURLE_LDAP_INVALID_URL',
63 => 'CURLE_FILESIZE_EXCEEDED',
64 => 'CURLE_USE_SSL_FAILED',
65 => 'CURLE_SEND_FAIL_REWIND',
66 => 'CURLE_SSL_ENGINE_INITFAILED',
67 => 'CURLE_LOGIN_DENIED',
68 => 'CURLE_TFTP_NOTFOUND',
69 => 'CURLE_TFTP_PERM',
70 => 'CURLE_REMOTE_DISK_FULL',
71 => 'CURLE_TFTP_ILLEGAL',
72 => 'CURLE_TFTP_UNKNOWNID',
73 => 'CURLE_REMOTE_FILE_EXISTS',
74 => 'CURLE_TFTP_NOSUCHUSER',
75 => 'CURLE_CONV_FAILED',
76 => 'CURLE_CONV_REQD',
77 => 'CURLE_SSL_CACERT_BADFILE',
78 => 'CURLE_REMOTE_FILE_NOT_FOUND',
79 => 'CURLE_SSH',
80 => 'CURLE_SSL_SHUTDOWN_FAILED',
81 => 'CURLE_AGAIN',
82 => 'CURLE_SSL_CRL_BADFILE',
83 => 'CURLE_SSL_ISSUER_ERROR',
84 => 'CURLE_FTP_PRET_FAILED',
84 => 'CURLE_FTP_PRET_FAILED',
85 => 'CURLE_RTSP_CSEQ_ERROR',
86 => 'CURLE_RTSP_SESSION_ERROR',
87 => 'CURLE_FTP_BAD_FILE_LIST',
88 => 'CURLE_CHUNK_FAILED');

      $err =($error_codes[$error] . " - " . $error);
      return false;
    }
  }

/**
 * 检测服务器函数支持情况
 * @param $f 函数名
 * @param $m 是否为必须函数
 * @return 
 */
function checkfunc($f, $m = false) {
	if (function_exists($f)) {
		return '<font color="green">可用</font>';
	} else {
		if ($m == false) {
			return '<font color="black">不支持</font>';
		} else {
			return '<font color="red">不支持</font>';
		}
	}
}

/**
 * 获取GET或POST过来的参数
 * @param $key 键值
 * @param $def 默认值
 * @return 获取到的内容（没有则为默认值）
 */
function getParam(string $key, $def = '') {
	return trim(isset($_REQUEST[$key]) ? $_REQUEST[$key] : $def);
}

/**
 * 输出一个json或jsonp格式的内容
 * @param $data 数组内容
 */
function show_json($data) {
	header('Content-type: application/json');
	$callback = getParam('callback');

	if (!is_string($data)) $data = json_encode($data, JSON_UNESCAPED_UNICODE);

	if ($callback) {//输出jsonp格式
		echo(htmlspecialchars($callback) . '(' . $data . ')');
	} else {
		echo($data);
	}

	exit;
}

function list_file(string $dir, array &$items) {
	if (!$dh = opendir($dir)) return false;
	while (($file = readdir($dh)) !== false) {
		if ($file =='.' || $file =='..') continue;
		$fullpath = $dir . '/' . $file;
		if (!is_dir($fullpath)) {
			$items[$fullpath] = $file;
		} else {
			list_file($fullpath, $items);
		}
	}
	closedir($dh);
}

// str => %xx
function escape(string $str) {
	return str_replace(Array(
		"?",
		"%",
		"#",
		"&",
		"="
	), Array(
		"%3F",
		"%25",
		"%23",
		"%26",
		"%3D"
	), $str);
}

function path_filter(string $path) {
	return str_replace([
		'/','\\',':','*','?','"','<','>','|'
	], "_", rtrim($path, '/'));
}

function hash_encode($str) {
	return str_replace(
		['+','/','='],
		['-','_',''],
		base64_encode($str)
	);
}

function hash_decode($str) {
	return base64_decode(
		str_replace(['-','_'],['+','/'],$str)
	);
}

function del($file) {
	is_file($file)&&unlink($file);
}

function file_proxy($url) {
	if(!is_file($url)) {
		header("HTTP/1.1 404 Not Found");
		echo $url;
		exit;
	}

	header("Access-Control-Allow-Origin: *");
	header("Cache-Control: max-age=31536000");

	header("Last-Modified: " . date("r", filemtime($url)));
	if(isset($_SERVER['HTTP_IF_MODIFIED_SINCE'])) {
		$t = date_create_from_format("D, d M Y H:i:s O", $_SERVER['HTTP_IF_MODIFIED_SINCE']);
		if($t->getTimestamp() > filemtime($url)) {
			header("HTTP/1.1 304 Not Modified");
			exit;
		}
	}

	$ext = strtolower(substr($url, strrpos($url,'.')+1));
	if (!$ext) exit;

	$type = "application/octet-stream";
	if(in_array($ext, ["mp3","m4a","ogg"]))
		$type = "audio/mpeg";
	else if(in_array($ext, ["jpg","png","jpeg","bmp","gif"]))
		$type = "image/jpeg";
	header("Content-Type: $type");

	if(isset($_SERVER["HTTP_RANGE"])) {
		$r = $_SERVER["HTTP_RANGE"];
		if(!strstr($r, "bytes=")) {
			header("HTTP/1.1 400 Bad Request");
			exit;
		}
		$r = explode("-", substr($r, 6));
		if(count($r) != 2) {
			header("HTTP/1.1 400 Bad Request");
			exit;
		}
		$len = (strlen($r[1]) > 0 ? $r[1] : filesize($url)) - $r[0];
		header("HTTP/1.1 206 Partial Content");
		header("Content-Length: ".$len);
		header("Content-Range: bytes ".$r[0].'-'.($len + $r[0] - 1).'/'.filesize($url));

		if($len > 0) {
			$handle = fopen($url, 'r');
			fseek($handle, $r[0]);
			while($len > 0) {
				$r = min($len, 4096);
				echo fread($handle, $r);
				flush();
				$len -= $r;
			}
			fclose($handle);
		}

		exit;
	}

	echo file_get_contents($url);
}