use base64::{engine::general_purpose::STANDARD, Engine};
use flate2::read::ZlibDecoder;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::Path;
use std::str;

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct CharacterCardMetadata {
    pub found: bool,
    #[serde(skip_serializing_if = "Option::is_none", rename = "chunkKeyword")]
    pub chunk_keyword: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "cardData")]
    pub card_data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

const PNG_SIGNATURE: [u8; 8] = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
const MAX_PNG_TEXT_CHUNK_BYTES: usize = 512 * 1024;
const MAX_PNG_DECOMPRESSED_TEXT_BYTES: usize = 2 * 1024 * 1024;
const MAX_TOTAL_METADATA_BYTES: usize = 4 * 1024 * 1024;

pub fn extract_character_card_metadata<P: AsRef<Path>>(path: P) -> Result<CharacterCardMetadata, String> {
    let file = File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
    let mut reader = BufReader::new(file);

    if !read_png_signature(&mut reader)? {
        return Ok(CharacterCardMetadata { found: false, ..Default::default() });
    }

    let chunks = extract_png_text_chunks(&mut reader)?;
    let candidate = find_chunk_case_insensitive(&chunks, "ccv3")
        .or_else(|| find_chunk_case_insensitive(&chunks, "chara"));

    let Some((chunk_key, payload)) = candidate else {
        return Ok(CharacterCardMetadata { found: false, ..Default::default() });
    };

    match parse_character_card_payload(&payload) {
        Ok(card_data) => Ok(CharacterCardMetadata { found: true, chunk_keyword: Some(chunk_key), card_data: Some(card_data), error: None }),
        Err(error) => Ok(CharacterCardMetadata { found: false, chunk_keyword: Some(chunk_key), card_data: None, error: Some(error) }),
    }
}

fn read_png_signature<R: Read>(reader: &mut R) -> Result<bool, String> {
    let mut signature = [0u8; 8];
    reader.read_exact(&mut signature).map_err(|e| format!("Failed to read signature: {}", e))?;
    Ok(signature == PNG_SIGNATURE)
}

fn extract_png_text_chunks<R: Read + Seek>(reader: &mut R) -> Result<HashMap<String, String>, String> {
    let mut chunks = HashMap::new();
    let mut total_metadata_bytes: usize = 0;

    loop {
        let mut length_bytes = [0u8; 4];
        if reader.read_exact(&mut length_bytes).is_err() { break; }
        let length = u32::from_be_bytes(length_bytes) as usize;

        let mut type_bytes = [0u8; 4];
        reader.read_exact(&mut type_bytes).map_err(|_| "Failed to read chunk type".to_string())?;
        let chunk_type = String::from_utf8_lossy(&type_bytes).to_string();

        if chunk_type == "IEND" { break; }
        if matches!(chunk_type.as_str(), "tEXt" | "iTXt" | "zTXt") {
            if length > MAX_PNG_TEXT_CHUNK_BYTES {
                return Err(format!("{} chunk exceeds limit ({} > {} bytes)", chunk_type, length, MAX_PNG_TEXT_CHUNK_BYTES));
            }
            let mut data = vec![0u8; length];
            reader.read_exact(&mut data).map_err(|_| format!("Failed to read {} data", chunk_type))?;
            let parsed = match chunk_type.as_str() {
                "tEXt" => parse_text_chunk(&data)?,
                "iTXt" => parse_itxt_chunk(&data)?,
                "zTXt" => parse_ztxt_chunk(&data)?,
                _ => None,
            };
            if let Some((keyword, text)) = parsed {
                total_metadata_bytes = total_metadata_bytes.saturating_add(text.len());
                if total_metadata_bytes > MAX_TOTAL_METADATA_BYTES {
                    return Err(format!("PNG metadata exceeds total limit ({} bytes)", MAX_TOTAL_METADATA_BYTES));
                }
                chunks.insert(keyword, text);
            }
        } else {
            let skip = i64::try_from(length).map_err(|_| "Chunk length is too large to skip safely".to_string())?;
            reader.seek(SeekFrom::Current(skip)).map_err(|_| "Failed to skip chunk".to_string())?;
        }
        reader.seek(SeekFrom::Current(4)).map_err(|_| "Failed to skip CRC".to_string())?;
    }
    Ok(chunks)
}

fn find_chunk_case_insensitive(chunks: &HashMap<String, String>, expected: &str) -> Option<(String, String)> {
    chunks.iter().find(|(key, _)| key.eq_ignore_ascii_case(expected)).map(|(key, value)| (key.clone(), value.clone()))
}

fn parse_character_card_payload(payload: &str) -> Result<serde_json::Value, String> {
    let trimmed = payload.trim();
    if trimmed.is_empty() { return Err("Character card chunk is empty".to_string()); }
    if let Ok(decoded) = STANDARD.decode(trimmed.as_bytes()) {
        if let Ok(decoded_text) = String::from_utf8(decoded) {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&decoded_text) { return Ok(value); }
        }
    }
    serde_json::from_str::<serde_json::Value>(trimmed).map_err(|e| format!("Failed to parse character card JSON: {}", e))
}

fn parse_text_chunk(data: &[u8]) -> Result<Option<(String, String)>, String> {
    let Some(null_idx) = data.iter().position(|&b| b == 0) else { return Ok(None); };
    let keyword = String::from_utf8_lossy(&data[..null_idx]).to_string();
    let text = String::from_utf8_lossy(&data[null_idx + 1..]).to_string();
    Ok(Some((keyword, text)))
}

fn parse_itxt_chunk(data: &[u8]) -> Result<Option<(String, String)>, String> {
    let mut pos = 0;
    let Some(key_end) = data[pos..].iter().position(|&b| b == 0) else { return Ok(None); };
    let keyword = String::from_utf8_lossy(&data[pos..pos + key_end]).to_string();
    pos += key_end + 1;
    if pos + 2 >= data.len() { return Ok(None); }
    let compression_flag = data[pos];
    pos += 2;
    let Some(lang_end) = data[pos..].iter().position(|&b| b == 0) else { return Ok(None); };
    pos += lang_end + 1;
    let Some(trans_end) = data[pos..].iter().position(|&b| b == 0) else { return Ok(None); };
    pos += trans_end + 1;
    if pos >= data.len() { return Ok(None); }
    let text_data = &data[pos..];
    let text = if compression_flag == 1 { decompress_utf8_with_limit(text_data)? } else { str::from_utf8(text_data).map_err(|_| "iTXt chunk contains invalid UTF-8 text".to_string())?.to_string() };
    Ok(Some((keyword, text)))
}

fn parse_ztxt_chunk(data: &[u8]) -> Result<Option<(String, String)>, String> {
    let Some(null_idx) = data.iter().position(|&b| b == 0) else { return Ok(None); };
    let keyword = String::from_utf8_lossy(&data[..null_idx]).to_string();
    if null_idx + 2 >= data.len() { return Ok(None); }
    let compressed_data = &data[null_idx + 2..];
    let text = decompress_utf8_with_limit(compressed_data)?;
    Ok(Some((keyword, text)))
}

fn decompress_utf8_with_limit(data: &[u8]) -> Result<String, String> {
    let mut decoder = ZlibDecoder::new(data);
    let mut output: Vec<u8> = Vec::new();
    let mut buffer = [0u8; 8192];
    loop {
        let read = decoder.read(&mut buffer).map_err(|e| format!("Failed to decompress PNG text chunk: {}", e))?;
        if read == 0 { break; }
        output.extend_from_slice(&buffer[..read]);
        if output.len() > MAX_PNG_DECOMPRESSED_TEXT_BYTES {
            return Err(format!("PNG metadata exceeds safe decompression limit ({} bytes)", MAX_PNG_DECOMPRESSED_TEXT_BYTES));
        }
    }
    String::from_utf8(output).map_err(|_| "Compressed PNG text chunk is not valid UTF-8".to_string())
}
