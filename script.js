(function () {
  // پروژه‌ی Supabase — دیتابیس واقعی و عمومی سایت
  var SUPABASE_URL = "https://enspqekbkmkigavtbjsh.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuc3BxZWtia21raWdhdnRianNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1MDIyNDUsImV4cCI6MjEwNjA3ODI0NX0.8R662-mZpjywrF0ToCEgCRSKPysx3xg6Z-t7twcAg-I";

  var panel = document.getElementById("userPanel");
  var overlay = document.getElementById("panelOverlay");
  var toggleBtn = document.getElementById("panelToggle");
  var closeBtn = document.getElementById("panelClose");
  var form = document.getElementById("productForm");
  var nameInput = document.getElementById("prodName");
  var priceInput = document.getElementById("prodPrice");
  var imageInput = document.getElementById("prodImage");
  var listEl = document.getElementById("productList");
  var circle = document.getElementById("circle");
  var circleEmpty = document.getElementById("circleEmpty");

  var products = []; // [{id, name, price, image}]
  var slideIndex = 0;
  var rotateTimer = null;
  var backend = null; // {add(p), remove(id)} — set once we know which store to use

  function openPanel() { panel.hidden = false; overlay.hidden = false; }
  function closePanel() { panel.hidden = true; overlay.hidden = true; }
  toggleBtn.addEventListener("click", openPanel);
  closeBtn.addEventListener("click", closePanel);
  overlay.addEventListener("click", closePanel);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePanel(); });

  function renderList() {
    listEl.innerHTML = "";
    products.forEach(function (p) {
      var li = document.createElement("li");
      var img = document.createElement("img");
      img.src = p.image || "";
      li.appendChild(img);

      var nameSpan = document.createElement("span");
      nameSpan.className = "p-name";
      nameSpan.textContent = p.name + (p.price ? " — " + p.price : "");
      li.appendChild(nameSpan);

      var removeBtn = document.createElement("button");
      removeBtn.className = "p-remove";
      removeBtn.type = "button";
      removeBtn.textContent = "حذف";
      removeBtn.addEventListener("click", function () { backend.remove(p.id); });
      li.appendChild(removeBtn);

      listEl.appendChild(li);
    });
  }

  function renderCircle() {
    circle.querySelectorAll(".circle-slide").forEach(function (el) { el.remove(); });

    if (products.length === 0) {
      circleEmpty.hidden = false;
      if (rotateTimer) { clearInterval(rotateTimer); rotateTimer = null; }
      return;
    }

    circleEmpty.hidden = true;
    if (slideIndex >= products.length) slideIndex = 0;

    products.forEach(function (p, i) {
      var slide = document.createElement("div");
      slide.className = "circle-slide" + (i === slideIndex ? " active" : "");
      if (p.image) {
        var img = document.createElement("img");
        img.src = p.image; img.alt = p.name;
        slide.appendChild(img);
      }
      var nameEl = document.createElement("div");
      nameEl.className = "s-name"; nameEl.textContent = p.name;
      slide.appendChild(nameEl);
      if (p.price) {
        var priceEl = document.createElement("div");
        priceEl.className = "s-price"; priceEl.textContent = p.price + " تومان";
        slide.appendChild(priceEl);
      }
      circle.appendChild(slide);
    });

    if (rotateTimer) clearInterval(rotateTimer);
    if (products.length > 1) {
      rotateTimer = setInterval(function () {
        slideIndex = (slideIndex + 1) % products.length;
        circle.querySelectorAll(".circle-slide").forEach(function (el, i) {
          el.classList.toggle("active", i === slideIndex);
        });
      }, 3000);
    }
  }

  function onProductsChanged(list) {
    products = list;
    renderList();
    renderCircle();
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var name = nameInput.value.trim();
    if (!name) return;
    var price = priceInput.value.trim();
    var file = imageInput.files && imageInput.files[0];

    function submit(imageDataUrl) {
      backend.add({ name: name, price: price, image: imageDataUrl || "" });
      form.reset();
    }

    if (file) {
      var reader = new FileReader();
      reader.onload = function () { submit(reader.result); };
      reader.readAsDataURL(file);
    } else {
      submit(null);
    }
  });

  // ---- localStorage backend: used for the plain exported site ----
  function localBackend() {
    var KEY = "darkgame:products";
    function load() {
      try { return JSON.parse(window.localStorage.getItem(KEY) || "[]"); }
      catch (e) { return []; }
    }
    function save(list) {
      try { window.localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
    }
    var list = load();
    onProductsChanged(list);
    return {
      add: function (p) {
        list.push({ id: String(Date.now()), name: p.name, price: p.price, image: p.image });
        save(list);
        onProductsChanged(list.slice());
      },
      remove: function (id) {
        list = list.filter(function (p) { return p.id !== id; });
        save(list);
        onProductsChanged(list.slice());
      }
    };
  }

  // ---- shared db backend: used when running inside a published claude.ai artifact ----
  function tryCloudBackend() {
    if (!window.claude || typeof window.claude.use !== "function") return null;
    return window.claude.use("db").then(function (db) {
      if (!db) return null;
      return window.claude.use("user").then(function (user) {
        var col = db.collection("products");
        col.orderBy("createdAt", "asc").onSnapshot(function (snap) {
          var list = snap.docs.map(function (d) {
            var data = d.data() || {};
            return { id: d.id, name: data.name, price: data.price, image: data.image };
          });
          onProductsChanged(list);
        }, function () { /* fall silent, keep last known list */ });

        if (user) {
          toggleBtn.hidden = false;
          user.can("data.write").then(function (v) {
            toggleBtn.hidden = (v === false);
          });
        }

        return {
          add: function (p) {
            col.add({ name: p.name, price: p.price, image: p.image, createdAt: Date.now() });
          },
          remove: function (id) { col.doc(id).delete(); }
        };
      });
    }).catch(function () { return null; });
  }

  // ---- Supabase backend: the real, public database for the hosted site ----
  function trySupabaseBackend() {
    if (!window.supabase || typeof window.supabase.createClient !== "function") return null;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
    var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    function refresh() {
      client.from("products").select("*").order("created_at", { ascending: true })
        .then(function (res) {
          if (res.error) return;
          var list = (res.data || []).map(function (row) {
            return { id: row.id, name: row.name, price: row.price, image: row.image };
          });
          onProductsChanged(list);
        });
    }

    refresh();
    client.channel("products-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, refresh)
      .subscribe();

    return {
      add: function (p) {
        client.from("products").insert({ name: p.name, price: p.price, image: p.image }).then(function () {});
      },
      remove: function (id) {
        client.from("products").delete().eq("id", id).then(function () {});
      }
    };
  }

  var cloud = tryCloudBackend();
  if (cloud) {
    cloud.then(function (b) {
      backend = b || trySupabaseBackend() || localBackend();
    });
  } else {
    backend = trySupabaseBackend() || localBackend();
  }
})();
