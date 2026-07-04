# Demo Markdown File

This file demonstrates all the markdown features supported by **lmv**.

## Text Formatting

Here's some **bold text**, *italic text*, and ***bold italic***. You can also use ~~strikethrough~~ and `inline code`.

## Links and Images

- [GitHub](https://github.com)
- [Local link to README](./README.md)

## Lists

### Unordered List
- Item 1
- Item 2
  - Nested item 2.1
  - Nested item 2.2
- Item 3

### Ordered List
1. First item
2. Second item
3. Third item

### Task List
- [x] Completed task
- [ ] Incomplete task
- [x] Another completed task

## Code Blocks

### JavaScript
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
  return { message: `Welcome, ${name}` };
}

greet("World");
```

### TypeScript
```typescript
interface User {
  id: number;
  name: string;
  email?: string;
}

const getUser = async (id: number): Promise<User> => {
  const response = await fetch(`/api/users/${id}`);
  return response.json();
};
```

### Python
```python
def fibonacci(n: int) -> list[int]:
    """Generate Fibonacci sequence up to n numbers."""
    fib = [0, 1]
    for i in range(2, n):
        fib.append(fib[i-1] + fib[i-2])
    return fib[:n]

print(fibonacci(10))
```

### Bash
```bash
#!/bin/bash
echo "Installing dependencies..."
npm install
npm run build
echo "Done!"
```

## Blockquotes

> This is a blockquote.
> It can span multiple lines.
>
> > And can be nested too!

## Tables

| Feature | Status | Notes |
|---------|--------|-------|
| Syntax Highlighting | Done | Uses highlight.js |
| Dark Mode | Done | System preference |
| Edit Mode | Done | Toggle with Cmd+E |
| Save | Done | Cmd+S to save |

## Horizontal Rule

---

## Math and Special Characters

Some special characters: &copy; &reg; &trade; &rarr; &larr;

## Conclusion

That's all the markdown features! Try editing this file by clicking the pencil icon or pressing `Cmd+E`.
