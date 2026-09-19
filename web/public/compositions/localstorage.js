import { ref, watch } from 'vue';

export function useLocalStorageRef(key, fallback) {
	let initialValue = fallback;
	try {
		const stored = localStorage.getItem(key);
		if (stored !== null) initialValue = JSON.parse(stored);
	} catch (error) {
		console.warn(`Unable to read local storage key "${key}":`, error);
	}

	const value = ref(initialValue);
	watch(value, (nextValue) => {
		try {
			localStorage.setItem(key, JSON.stringify(nextValue));
		} catch (error) {
			console.warn(`Unable to save local storage key "${key}":`, error);
		}
	}, { deep: true });

	return value;
}
