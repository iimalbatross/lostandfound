// ---------- Supabase config ----------
// NOTE: inko apne Supabase dashboard se copy karke yahan paste karo
const SUPABASE_URL = "https://xidxicyppxalxtacznmq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpZHhpY3lwcHhhbHh0YWN6bm1xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MjU4NTMsImV4cCI6MjA4NzAwMTg1M30.Qxj6Mc4IetuwIIg5rpr__K2wEbreLV-IPe51C1rrv7w";
const STORAGE_BUCKET = "item-images"; // is naam ka bucket Supabase me banao

// Supabase client (global `supabase` index.html me CDN se aa raha hai)
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- UI references ----------
let items = [];

const form = document.getElementById("item-form");
const itemsList = document.getElementById("items-list");
const filterType = document.getElementById("filter-type");
const yearSpan = document.getElementById("year");
const submitBtn = document.getElementById("submit-btn");
const btnText = submitBtn.querySelector(".btn-text");
const btnLoader = submitBtn.querySelector(".btn-loader");
const loadingState = document.getElementById("loading-state");
const toast = document.getElementById("toast");
const toastMessage = document.getElementById("toast-message");
const toastClose = document.getElementById("toast-close");

yearSpan.textContent = new Date().getFullYear();

form.addEventListener("submit", handleFormSubmit);
filterType.addEventListener("change", () => renderItems());
toastClose.addEventListener("click", hideToast);

// ---------- Toast Notification Functions ----------
function showToast(message, type = "info") {
  toastMessage.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.add("show");
  
  // Auto hide after 4 seconds
  setTimeout(() => {
    hideToast();
  }, 4000);
}

function hideToast() {
  toast.classList.remove("show");
}

// ---------- Loading State Functions ----------
function setLoading(isLoading) {
  if (isLoading) {
    submitBtn.disabled = true;
    btnText.style.display = "none";
    btnLoader.style.display = "inline-flex";
  } else {
    submitBtn.disabled = false;
    btnText.style.display = "inline-block";
    btnLoader.style.display = "none";
  }
}

function setItemsLoading(isLoading) {
  if (isLoading) {
    loadingState.style.display = "block";
    itemsList.style.opacity = "0.5";
  } else {
    loadingState.style.display = "none";
    itemsList.style.opacity = "1";
  }
}

// ---------- Form submit -> upload image + save row ----------
async function handleFormSubmit(event) {
  event.preventDefault();

  setLoading(true);

  const formData = new FormData(form);

  const type = formData.get("type") || "lost";
  const title = formData.get("title")?.trim() || "";
  const category = formData.get("category") || "Others";
  const location = formData.get("location")?.trim() || "";
  const date = formData.get("date") || "";
  const description = formData.get("description")?.trim() || "";
  const contact = formData.get("contact")?.trim() || "";
  const file = formData.get("photo");

  if (!title) {
    setLoading(false);
    showToast("Please enter an item title", "error");
    return;
  }

  let imageUrl = ""; // Empty string instead of null (for NOT NULL constraint)

  try {
    // 1) Image Supabase Storage me upload karo (agar diya hai)
    if (file && file.size > 0) {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const filePath = `items/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;

      const { data: uploadData, error: uploadError } = await supabaseClient
        .storage
        .from(STORAGE_BUCKET)
        .upload(filePath, file);

      if (uploadError) {
        setLoading(false);
        showToast("Image upload failed: " + uploadError.message, "error");
        return;
      }

      const { data: publicUrlData } = supabaseClient
        .storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(uploadData.path);

      imageUrl = publicUrlData?.publicUrl || "";
    }

    // 2) Row items table me insert karo
    // Prepare data object - only include image_url if it has a value
    const insertData = {
      type,
      title,
      category,
      location: location || "",
      date: date || "",
      description: description || "",
      contact: contact || ""
    };
    
    // Only add image_url if it's not empty
    if (imageUrl && imageUrl.trim() !== "") {
      insertData.image_url = imageUrl;
    } else {
      insertData.image_url = ""; // Empty string instead of null
    }

    const { error: insertError } = await supabaseClient.from("items").insert(insertData);

    if (insertError) {
      setLoading(false);
      showToast("Failed to post item: " + insertError.message, "error");
      return;
    }

    // Success!
    form.reset();
    setLoading(false);
    showToast("Item posted successfully! 🎉", "success");
    
    // Scroll to items section
    document.getElementById("list-section").scrollIntoView({ 
      behavior: "smooth", 
      block: "start" 
    });
    
    await fetchItems();
  } catch (error) {
    setLoading(false);
    showToast("Something went wrong. Please try again.", "error");
    console.error("Error:", error);
  }
}

// ---------- DB se items fetch ----------
async function fetchItems() {
  setItemsLoading(true);
  
  try {
    const { data, error } = await supabaseClient
      .from("items")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching items:", error);
      items = [];
      showToast("Failed to load items. Please refresh the page.", "error");
    } else {
      items = data || [];
    }

    renderItems();
  } catch (error) {
    console.error("Error:", error);
    items = [];
    showToast("Something went wrong while loading items.", "error");
  } finally {
    setItemsLoading(false);
  }
}

// ---------- Render list ----------
function renderItems() {
  itemsList.innerHTML = "";

  const filterValue = filterType.value;
  const visibleItems =
    filterValue === "all"
      ? items
      : items.filter(item => item.type === filterValue);

  if (!visibleItems.length) {
    const emptyDiv = document.createElement("div");
    emptyDiv.className = "empty-state";
    emptyDiv.textContent =
      "No items posted yet. Be the first to report a lost or found item.";
    itemsList.appendChild(emptyDiv);
    return;
  }

  visibleItems.forEach(item => {
    const card = document.createElement("article");
    card.className = "item-card";

    if (item.image_url) {
      const imageWrapper = document.createElement("div");
      imageWrapper.className = "item-image-wrapper";

      const img = document.createElement("img");
      img.src = item.image_url;
      img.alt = item.title || "Item image";

      imageWrapper.appendChild(img);
      card.appendChild(imageWrapper);
    }

    const tag = document.createElement("span");
    tag.className = `item-tag ${item.type}`;
    tag.textContent = item.type === "lost" ? "Lost" : "Found";
    card.appendChild(tag);

    const titleEl = document.createElement("h3");
    titleEl.className = "item-title";
    titleEl.textContent = item.title || "Unnamed item";
    card.appendChild(titleEl);

    const meta = document.createElement("div");
    meta.className = "item-meta";

    const categorySpan = document.createElement("span");
    categorySpan.textContent = item.category;
    meta.appendChild(categorySpan);

    if (item.location) {
      const locSpan = document.createElement("span");
      locSpan.textContent = item.location;
      meta.appendChild(locSpan);
    }

    if (item.date) {
      const dateSpan = document.createElement("span");
      dateSpan.textContent = formatDisplayDate(item.date);
      meta.appendChild(dateSpan);
    }

    card.appendChild(meta);

    if (item.description) {
      const desc = document.createElement("p");
      desc.className = "item-desc";
      desc.textContent = item.description;
      card.appendChild(desc);
    }

    if (item.contact) {
      const contact = document.createElement("p");
      contact.className = "item-contact";
      contact.textContent = `Contact: ${item.contact}`;
      card.appendChild(contact);
    }

    itemsList.appendChild(card);
  });
}

function formatDisplayDate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

// Page load par DB se data lao
fetchItems();
