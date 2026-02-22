(async () => {
  const containerId = "todo-container-1";
  const container = document.getElementById(containerId);

  try {
    const response = await fetch("https://jsonplaceholder.typicode.com/todos/1");
    const todo = await response.json();
    if (!container) return;
    
    container.innerHTML = `
      <div>
        <h3>TODO #${todo.id}</h3>
        <p><strong>Title:</strong> ${todo.title}</p>
        <p><strong>Completed:</strong> ${todo.completed}</p>
      </div>
    `;
  } catch (e) {
    container.innerHTML = "<p>Ошибка загрузки TODO</p>";
    console.error(e);
  }
})();