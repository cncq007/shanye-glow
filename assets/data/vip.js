/* ==========================================================
   山野拾光 · 会员专区数据
   只有登录用户（VIP）能在「04 会员专区」看到这里的内容。
   新增内容：photos 里填 SITE_DATA.photos 已有的图片 id；
   videos 里直接写视频条目（src/poster/duration 与公开影像同格式）。
   注意：维护面板不管理本文件，改这里不会被面板覆盖。
   ========================================================== */
(function () {
  window.VIP_DATA = {
    desc: "注册成为站点的会员后，可以在这里看到更多没放进公开板块的图片和影像。注册很简单：一个昵称加 6 位密码就够了。",

    /* 会员图片：从公开图库里精选一批，点击可进大图灯箱 */
    photoIds: ["g05", "g11", "g15", "g03", "g13", "g02", "g08", "g12", "g14", "g07"],

    /* 会员影像：往期川滇自驾速览（v01–v06），仅登录后可看 */
    videos: [
      { id: "v01", title: "雨雾中的理小路", place: "川西 · 阿坝", duration: "02:00", poster: "assets/video/v01.jpg", src: "assets/video/v01.mp4" },
      { id: "v02", title: "玉科草原的阳光", place: "川西 · 甘孜", duration: "02:00", poster: "assets/video/v02.jpg", src: "assets/video/v02.mp4" },
      { id: "v03", title: "驰行千里到乡城", place: "川西 · 甘孜", duration: "02:00", poster: "assets/video/v03.jpg", src: "assets/video/v03.mp4" },
      { id: "v04", title: "香格里拉的烛光晚餐", place: "云南 · 迪庆", duration: "02:00", poster: "assets/video/v04.jpg", src: "assets/video/v04.mp4" },
      { id: "v05", title: "丽江两日游", place: "云南 · 丽江", duration: "02:00", poster: "assets/video/v05.jpg", src: "assets/video/v05.mp4" },
      { id: "v06", title: "在大理看洱海", place: "云南 · 大理", duration: "02:00", poster: "assets/video/v06.jpg", src: "assets/video/v06.mp4" }
    ]
  };
})();
