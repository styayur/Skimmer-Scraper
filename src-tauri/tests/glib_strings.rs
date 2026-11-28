#![cfg(target_os = "linux")]

use glib::prelude::*;

#[test]
fn native_variant_string_iteration() {
    let words = ["", "Skimmer", "樱花", "café"];
    let variant = words.as_slice().to_variant();
    let strings = || variant.array_iter_str().unwrap();
    assert_eq!(strings().len(), words.len());
    assert!(strings().eq(words));
    assert!(strings().rev().eq(words.into_iter().rev()));

    let mut both_ends = strings();
    assert_eq!(both_ends.next(), Some(""));
    assert_eq!(both_ends.next_back(), Some("café"));
    assert_eq!(both_ends.nth(1), Some("樱花"));
    assert_eq!(both_ends.next_back(), None);

    let empty: &[&str] = &[];
    assert_eq!(empty.to_variant().array_iter_str().unwrap().next(), None);
}
