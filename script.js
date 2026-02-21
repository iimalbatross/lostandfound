// ---------- Supabase config ----------
// NOTE: inko apne Supabase dashboard se copy karke yahan paste karo
const SUPABASE_URL = "https://xidxicyppxalxtacznmq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpZHhpY3lwcHhhbHh0YWN6bm1xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MjU4NTMsImV4cCI6MjA4NzAwMTg1M30.Qxj6Mc4IetuwIIg5rpr__K2wEbreLV-IPe51C1rrv7w";
const STORAGE_BUCKET = "item-images"; // is naam ka bucket Supabase me banao

// Supabase client (global `supabase` index.html me CDN se aa raha hai)
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Auto-delete posts older than 2 weeks (14 days)
const POST_EXPIRY_DAYS = 14;

// ---------- UI references ----------
let items = [];
let issues = [];

const form = document.getElementById("item-form");
const itemsList = document.getElementById("items-list");
const filterType = document.getElementById("filter-type");
const searchDate = document.getElementById("search-date");
const clearSearch = document.getElementById("clear-search");
const yearSpan = document.getElementById("year");
const submitBtn = document.getElementById("submit-btn");
const btnText = submitBtn.querySelector(".btn-text");
const btnLoader = submitBtn.querySelector(".btn-loader");
const loadingState = document.getElementById("loading-state");
const toast = document.getElementById("toast");
const toastMessage = document.getElementById("toast-message");
const toastClose = document.getElementById("toast-close");

// Platform switching elements
const platformTabs = document.querySelectorAll(".platform-tab");
const lostFoundPlatform = document.getElementById("lost-found-platform");
const campusNavPlatform = document.getElementById("campus-nav-platform");

// Issue Reporting elements
const issueForm = document.getElementById("issue-form");
const issuesList = document.getElementById("issues-list");
const filterIssueType = document.getElementById("filter-issue-type");
const filterIssuePriority = document.getElementById("filter-issue-priority");
const issueSubmitBtn = document.getElementById("issue-submit-btn");
const issuesLoadingState = document.getElementById("issues-loading-state");

function isValidStudentId(studentId) {
  return /^[A-Za-z0-9]{4,20}$/.test(String(studentId || "").trim());
}

function getTodayDateString() {
  return new Date().toISOString().split("T")[0];
}

yearSpan.textContent = new Date().getFullYear();

// Restrict date inputs to today or past (no future dates)
const postDateInput = document.getElementById("date");
const searchDateInput = document.getElementById("search-date");
if (postDateInput) postDateInput.setAttribute("max", getTodayDateString());
if (searchDateInput) searchDateInput.setAttribute("max", getTodayDateString());

// Platform switching
platformTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    const platform = tab.dataset.platform;
    switchPlatform(platform);
  });
});

// Issue form
issueForm.addEventListener("submit", handleIssueSubmit);
filterIssueType.addEventListener("change", () => renderIssues());
filterIssuePriority.addEventListener("change", () => renderIssues());

form.addEventListener("submit", handleFormSubmit);
filterType.addEventListener("change", () => renderItems());
searchDate.addEventListener("change", handleSearch);
clearSearch.addEventListener("click", clearSearchDate);
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
      contact: contact || "",
      status: type === "lost" ? "searching" : "pending"
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
function isOlderThanTwoWeeks(createdAt) {
  if (!createdAt) return false;
  const created = new Date(createdAt).getTime();
  const twoWeeksAgo = Date.now() - POST_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  return created < twoWeeksAgo;
}

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
      const allItems = data || [];
      const expiredIds = allItems.filter(i => isOlderThanTwoWeeks(i.created_at)).map(i => i.id);
      if (expiredIds.length > 0) {
        await supabaseClient.from("items").delete().in("id", expiredIds);
      }
      items = allItems.filter(i => !isOlderThanTwoWeeks(i.created_at));
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

// ---------- Search functionality ----------
function handleSearch() {
  const searchValue = searchDate.value;
  if (searchValue) {
    clearSearch.style.display = "block";
  } else {
    clearSearch.style.display = "none";
  }
  renderItems();
}

function clearSearchDate() {
  searchDate.value = "";
  clearSearch.style.display = "none";
  renderItems();
}

// ---------- Render list ----------
function renderItems() {
  itemsList.innerHTML = "";

  let visibleItems = [...items];

  // Apply type filter
  const filterValue = filterType.value;
  if (filterValue !== "all") {
    visibleItems = visibleItems.filter(item => item.type === filterValue);
  }

  // Apply date search
  const searchValue = searchDate.value;
  if (searchValue) {
    visibleItems = visibleItems.filter(item => {
      if (!item.date) return false;
      return item.date === searchValue;
    });
  }

  if (!visibleItems.length) {
    const emptyDiv = document.createElement("div");
    emptyDiv.className = "empty-state";
    emptyDiv.textContent = searchValue
      ? "No items found for the selected date."
      : "No items posted yet. Be the first to report a lost or found item.";
    itemsList.appendChild(emptyDiv);
    return;
  }

  visibleItems.forEach(item => {
    const card = document.createElement("article");
    card.className = "item-card";

    if (item.image_url && item.image_url.trim() !== "") {
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

    const statusRow = document.createElement("div");
    statusRow.className = "item-status-row";
    const statusLabel = document.createElement("span");
    statusLabel.className = "item-status-label";
    statusLabel.textContent = "Status: ";
    statusRow.appendChild(statusLabel);
    const itemStatus = item.status || (item.type === "lost" ? "searching" : "pending");
    const statusSelect = document.createElement("select");
    statusSelect.className = `item-status-select item-status-${itemStatus}`;
    statusSelect.setAttribute("aria-label", "Update status");
    if (item.type === "lost") {
      ["searching", "found"].forEach(val => {
        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = val === "searching" ? "Searching" : "Found";
        if (itemStatus === val) opt.selected = true;
        statusSelect.appendChild(opt);
      });
    } else {
      ["pending", "returned"].forEach(val => {
        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = val === "pending" ? "Pending" : "Returned";
        if (itemStatus === val) opt.selected = true;
        statusSelect.appendChild(opt);
      });
    }
    statusSelect.addEventListener("change", () => {
      updateItemStatus(item.id, statusSelect.value);
    });
    statusRow.appendChild(statusSelect);
    card.appendChild(statusRow);

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

async function updateItemStatus(itemId, newStatus) {
  try {
    const { error } = await supabaseClient
      .from("items")
      .update({ status: newStatus })
      .eq("id", itemId);

    if (error) {
      showToast("Failed to update status: " + error.message, "error");
      return;
    }
    const item = items.find(i => i.id === itemId);
    if (item) item.status = newStatus;
    renderItems();
    const label = newStatus === "found" ? "Found" : newStatus === "returned" ? "Returned" : newStatus === "searching" ? "Searching" : "Pending";
    showToast("Status updated to " + label, "success");
  } catch (err) {
    showToast("Something went wrong.", "error");
    console.error(err);
  }
}

// ---------- Platform Switching Functions ----------
function switchPlatform(platform) {
  platformTabs.forEach(tab => {
    if (tab.dataset.platform === platform) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }
  });

  if (platform === "lost-found") {
    lostFoundPlatform.classList.add("active");
    lostFoundPlatform.style.display = "block";
    campusNavPlatform.classList.remove("active");
    campusNavPlatform.style.display = "none";
  } else if (platform === "campus-nav") {
    campusNavPlatform.classList.add("active");
    campusNavPlatform.style.display = "block";
    lostFoundPlatform.classList.remove("active");
    lostFoundPlatform.style.display = "none";
    fetchIssues();
  }
}

// ---------- Issue Reporting Functions ----------
async function handleIssueSubmit(event) {
  event.preventDefault();
  
  const issueSubmitBtnText = issueSubmitBtn.querySelector(".btn-text");
  const issueSubmitBtnLoader = issueSubmitBtn.querySelector(".btn-loader");
  
  issueSubmitBtn.disabled = true;
  issueSubmitBtnText.style.display = "none";
  issueSubmitBtnLoader.style.display = "inline-flex";

  const formData = new FormData(issueForm);
  const studentId = formData.get("issue-student-id")?.trim() || "";
  const issueType = formData.get("issue-type");
  const location = formData.get("issue-location")?.trim() || "";
  const description = formData.get("issue-description")?.trim() || "";
  const priority = formData.get("issue-priority") || "medium";
  const contact = formData.get("issue-contact")?.trim() || "";
  const file = formData.get("issue-photo");

  if (!isValidStudentId(studentId)) {
    issueSubmitBtn.disabled = false;
    issueSubmitBtnText.style.display = "inline-block";
    issueSubmitBtnLoader.style.display = "none";
    showToast("Please enter a valid Student ID (4-20 letters/numbers)", "error");
    return;
  }

  if (!issueType || !location || !description) {
    issueSubmitBtn.disabled = false;
    issueSubmitBtnText.style.display = "inline-block";
    issueSubmitBtnLoader.style.display = "none";
    showToast("Please fill all required fields", "error");
    return;
  }

  let imageUrl = "";

  try {
    // Upload image if provided
    if (file && file.size > 0) {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const filePath = `issues/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { data: uploadData, error: uploadError } = await supabaseClient
        .storage
        .from(STORAGE_BUCKET)
        .upload(filePath, file);

      if (uploadError) {
        issueSubmitBtn.disabled = false;
        issueSubmitBtnText.style.display = "inline-block";
        issueSubmitBtnLoader.style.display = "none";
        showToast("Image upload failed: " + uploadError.message, "error");
        return;
      }

      const { data: publicUrlData } = supabaseClient
        .storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(uploadData.path);

      imageUrl = publicUrlData?.publicUrl || "";
    }

    // Insert issue into database
    const insertData = {
      student_id: studentId,
      issue_type: issueType,
      location: location,
      description: description,
      priority: priority,
      contact: contact || "",
      image_url: imageUrl || "",
      status: "pending"
    };

    const { error: insertError } = await supabaseClient.from("issues").insert(insertData);

    if (insertError) {
      issueSubmitBtn.disabled = false;
      issueSubmitBtnText.style.display = "inline-block";
      issueSubmitBtnLoader.style.display = "none";
      showToast("Failed to submit issue: " + insertError.message, "error");
      return;
    }

    issueForm.reset();
    issueSubmitBtn.disabled = false;
    issueSubmitBtnText.style.display = "inline-block";
    issueSubmitBtnLoader.style.display = "none";
    showToast("Issue reported successfully! 🎉", "success");
    await fetchIssues();
  } catch (error) {
    issueSubmitBtn.disabled = false;
    issueSubmitBtnText.style.display = "inline-block";
    issueSubmitBtnLoader.style.display = "none";
    showToast("Something went wrong. Please try again.", "error");
    console.error("Error:", error);
  }
}

async function fetchIssues() {
  issuesLoadingState.style.display = "block";
  issuesList.style.opacity = "0.5";
  
  try {
    const { data, error } = await supabaseClient
      .from("issues")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching issues:", error);
      issues = [];
      showToast("Failed to load issues. Please refresh the page.", "error");
    } else {
      const allIssues = data || [];
      const expiredIds = allIssues.filter(i => isOlderThanTwoWeeks(i.created_at)).map(i => i.id);
      if (expiredIds.length > 0) {
        await supabaseClient.from("issues").delete().in("id", expiredIds);
      }
      issues = allIssues.filter(i => !isOlderThanTwoWeeks(i.created_at));
    }

    renderIssues();
  } catch (error) {
    console.error("Error:", error);
    issues = [];
    showToast("Something went wrong while loading issues.", "error");
  } finally {
    issuesLoadingState.style.display = "none";
    issuesList.style.opacity = "1";
  }
}

function renderIssues() {
  issuesList.innerHTML = "";

  let visibleIssues = [...issues];

  // Apply type filter
  const typeFilter = filterIssueType.value;
  if (typeFilter !== "all") {
    visibleIssues = visibleIssues.filter(issue => issue.issue_type === typeFilter);
  }

  // Apply priority filter
  const priorityFilter = filterIssuePriority.value;
  if (priorityFilter !== "all") {
    visibleIssues = visibleIssues.filter(issue => issue.priority === priorityFilter);
  }

  if (!visibleIssues.length) {
    const emptyDiv = document.createElement("div");
    emptyDiv.className = "empty-state";
    emptyDiv.textContent = "No issues reported yet.";
    issuesList.appendChild(emptyDiv);
    return;
  }

  visibleIssues.forEach(issue => {
    const card = document.createElement("article");
    card.className = "issue-card item-card";

    if (issue.image_url && issue.image_url.trim() !== "") {
      const imageWrapper = document.createElement("div");
      imageWrapper.className = "item-image-wrapper";
      const img = document.createElement("img");
      img.src = issue.image_url;
      img.alt = issue.description || "Issue image";
      imageWrapper.appendChild(img);
      card.appendChild(imageWrapper);
    }

    const priorityTag = document.createElement("span");
    priorityTag.className = `issue-priority ${issue.priority}`;
    priorityTag.textContent = issue.priority;
    card.appendChild(priorityTag);

    const typeTag = document.createElement("span");
    typeTag.className = "issue-type";
    typeTag.textContent = issue.issue_type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    card.appendChild(typeTag);

    const locationEl = document.createElement("div");
    locationEl.className = "issue-location";
    locationEl.textContent = `📍 ${issue.location}`;
    card.appendChild(locationEl);

    const descEl = document.createElement("p");
    descEl.className = "issue-description";
    descEl.textContent = issue.description;
    card.appendChild(descEl);

    const metaEl = document.createElement("div");
    metaEl.className = "issue-meta";
    
    if (issue.student_id) {
      const studentSpan = document.createElement("span");
      studentSpan.textContent = `Student ID: ${issue.student_id}`;
      metaEl.appendChild(studentSpan);
    }
    if (issue.contact) {
      const contactSpan = document.createElement("span");
      contactSpan.textContent = `Contact: ${issue.contact}`;
      metaEl.appendChild(contactSpan);
    }

    const statusRow = document.createElement("div");
    statusRow.className = "issue-status-row";
    const statusLabel = document.createElement("span");
    statusLabel.className = "issue-status-label";
    statusLabel.textContent = "Status: ";
    statusRow.appendChild(statusLabel);
    const statusSelect = document.createElement("select");
    statusSelect.className = `issue-status-select issue-status-${issue.status || 'pending'}`;
    statusSelect.setAttribute("aria-label", "Update status");
    ["pending", "in-progress", "resolved"].forEach(val => {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = val === "pending" ? "Pending" : val === "in-progress" ? "In progress" : "Resolved";
      if ((issue.status || "pending") === val) opt.selected = true;
      statusSelect.appendChild(opt);
    });
    statusSelect.addEventListener("change", () => {
      const newStatus = statusSelect.value;
      updateIssueStatus(issue.id, newStatus);
    });
    statusRow.appendChild(statusSelect);
    metaEl.appendChild(statusRow);

    card.appendChild(metaEl);
    issuesList.appendChild(card);
  });
}

async function updateIssueStatus(issueId, newStatus) {
  try {
    const { error } = await supabaseClient
      .from("issues")
      .update({ status: newStatus })
      .eq("id", issueId);

    if (error) {
      showToast("Failed to update status: " + error.message, "error");
      return;
    }
    const issue = issues.find(i => i.id === issueId);
    if (issue) issue.status = newStatus;
    renderIssues();
    showToast("Status updated to " + (newStatus === "resolved" ? "Resolved" : newStatus === "in-progress" ? "In progress" : "Pending"), "success");
  } catch (err) {
    showToast("Something went wrong.", "error");
    console.error(err);
  }
}

// Page load par DB se data lao
fetchItems();
