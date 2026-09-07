#include "position.hpp"

#include <cassert>

using connect5::Position;

int main() {
  Position position;
  assert(position.play(0));
  assert(position.height[0] == 1);
  assert(position.turn == 1);

  auto horizontal = Position::from_moves("192939495");
  assert(horizontal);
  assert(horizontal->won(0));
  assert(!horizontal->play(6));

  auto vertical = Position::from_moves("121212121");
  assert(vertical);
  assert(vertical->won(0));

  auto invalid = Position::from_moves("11111111");
  assert(!invalid);

  auto asymmetric = Position::from_moves("11234");
  assert(asymmetric);
  assert(asymmetric->mirrored().mirrored().player[0] == asymmetric->player[0]);
  assert(asymmetric->mirrored().mirrored().player[1] == asymmetric->player[1]);
  assert(asymmetric->key() == asymmetric->mirrored().key());
}
