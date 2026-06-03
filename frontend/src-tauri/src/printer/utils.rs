pub fn pad_right(s: &str, length: usize) -> String {
    if s.len() >= length {
        return s.chars().take(length).collect();
    }
    format!("{}{}", s, " ".repeat(length - s.len()))
}

pub fn pad_left(s: &str, length: usize) -> String {
    if s.len() >= length {
        return s.chars().take(length).collect();
    }
    format!("{}{}", " ".repeat(length - s.len()), s)
}

pub fn wrap_text(text: &str, width: usize) -> Vec<String> {
    let words: Vec<&str> = text.split_whitespace().collect();
    if words.is_empty() {
        return vec![String::new()];
    }

    let mut lines = Vec::new();
    let mut current_line = words[0].to_string();

    for word in &words[1..] {
        if current_line.len() + 1 + word.len() <= width {
            current_line.push(' ');
            current_line.push_str(word);
        } else {
            lines.push(current_line);
            current_line = word.to_string();
        }
    }
    lines.push(current_line);
    lines
}

pub fn format_amount(val: f64) -> String {
    format!("{:.2}", val)
}

pub fn get_line_width(width: &str) -> usize {
    match width {
        "2inch" => 32,
        _ => 48, // Default 3inch
    }
}
