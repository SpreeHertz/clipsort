<script setup>
import { ref } from 'vue'

const newFriend = ref('')
const props = defineProps({
  isOpen: Boolean,
  friends: Array
})

const emit = defineEmits(['close', 'add', 'remove'])

const handleAdd = () => {
  if (newFriend.value.trim()) {
    emit('add', newFriend.value.trim().toLowerCase());
    newFriend.value = ''; 
  }
};
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="modal-overlay" @click.self="$emit('close')">
      <div class="modal-box">
        <button class="close-x" @click="$emit('close')">✕</button>

        <h2>Defining Friends</h2>
        <p class="description">
          To sort through your clips friends-wise, define friends here (Assuming the friend's name(s) are on the clips' filename).
          Once defined, ClipSort will make a graph view.
        </p>

        <div class="input-row">
          <input 
            v-model="newFriend" 
            placeholder="e.g. Alice" 
            @keyup.enter="handleAdd"
          />
          <button class="add-btn" @click="handleAdd">Add Friend</button>
        </div>

        <div class="friends-container">
          <div v-for="friend in friends" :key="friend" class="friend-row">
            <span>{{ friend.toLowerCase() }}</span>
            <button class="remove-btn" @click="$emit('remove', friend)">Remove</button>
          </div>
          <p v-if="friends.length === 0" class="empty-state">No friends defined yet.</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85); 
  backdrop-filter: blur(8px);
  display: grid;
  place-items: center;
  z-index: 1000;
}

.modal-box {
  background: #0a0a0a;
  border: 1px solid #333;
  padding: 2rem;
  width: 450px;
  position: relative;
  border-radius: 4px;
}

.close-x {
  position: absolute;
  top: 15px;
  right: 15px;
  background: transparent;
  border: none;
  color: #666;
  cursor: pointer;
  font-size: 1.2rem;
}

.close-x:hover { color: white; }

h2 { margin-top: 0; font-size: 1.5rem; }
.description { color: #888; font-size: 0.9rem; margin-bottom: 2rem; }

.input-row { display: flex; gap: 10px; margin-bottom: 2rem; }

input {
  flex: 1;
  background: #000;
  border: 1px solid #333;
  color: white;
  padding: 8px 12px;
  outline: none;
}

input:focus { border-color: #666; }

.add-btn { background: rgb(224, 224, 224); color: black; border: transparent; border-radius: 3px; padding: 0 15px; font-weight: bold; cursor: pointer; }
.add-btn:hover {
    background: rgba(224, 224, 224, 0.79);
}

.friends-container {
  max-height: 200px;
  overflow-y: auto;
  border-top: 1px solid #222;
  padding-top: 1rem;
}

.friend-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #111;
}

.remove-btn {
  background: transparent;
  border: none;
  color: #ff4d4d;
  cursor: pointer;
  font-size: 0.8rem;
}

.remove-btn:hover {
  background: transparent;
  border: none;
  color: #e14545;
  cursor: pointer;
  font-size: 0.8rem;
}

</style>